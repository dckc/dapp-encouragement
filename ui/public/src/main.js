// @ts-check
import dappConstants from '../lib/constants.js';
import { connect } from './connect.js';
import { walletUpdatePurses, flipSelectedBrands } from './wallet.js';

const { 
  INVITE_BRAND_BOARD_ID, 
  INSTANCE_HANDLE_BOARD_ID, 
  INSTALLATION_HANDLE_BOARD_ID,
} = dappConstants;

/**
 * @type {Object.<string, HTMLSelectElement>}
 */
const selects = {
  $brands: /** @type {HTMLSelectElement} */ (document.getElementById('brands')),
  $tipPurse: /** @type {HTMLSelectElement} */ (document.getElementById('tipPurse')),
  $intoPurse: /** @type {HTMLSelectElement} */ (document.getElementById('intoPurse')),
};

const $forFree = /** @type {HTMLInputElement} */ (document.getElementById('forFree'));
const $forTip = /** @type {HTMLInputElement} */ (document.getElementById('forTip'));
const $encourageForm = /** @type {HTMLFormElement} */ (document.getElementById('encourageForm'));

export default async function main() {
  selects.$brands.addEventListener('change', () => {
    flipSelectedBrands(selects);
  });

  let zoeInviteDepositFacetId;
  
  /**
   * @param {{ type: string; data: any; walletURL: string }} obj
   */
  const walletRecv = obj => {
    switch (obj.type) {
      case 'walletUpdatePurses': {
        const purses = JSON.parse(obj.data);
        walletUpdatePurses(purses, selects);
        $inputAmount.removeAttribute('disabled');
        break;
      }
      case 'walletURL': {
       // Change the form action to URL.
       $encourageForm.action = `${obj.walletURL}`;
       break;
      }
      case 'walletDepositFacetIdResponse': {
        zoeInviteDepositFacetId = obj.data;
      }
    }
  };

  const $numEncouragements = /** @type {HTMLInputElement} */ (document.getElementById('numEncouragements'));
  const $inputAmount = /** @type {HTMLInputElement} */ (document.getElementById('inputAmount'));

  /**
   * @param {{ type: string; data: any; }} obj
   */
  const apiRecv = obj => {
    switch (obj.type) {
      case 'encouragement/getEncouragementResponse': {
        alert(`Encourager says: ${obj.data}`);
        break;
      }
      case 'encouragement/encouragedResponse': {
        $numEncouragements.innerHTML = obj.data.count;
        break;
      }
      case 'encouragement/sendInviteResponse': {
        // Once the invite has been sent to the user, we update the
        // offer to include the inviteHandleBoardId. Then we make a
        // request to the user's wallet to send the proposed offer for
        // acceptance/rejection.
        const { offer } = obj.data;
        walletSend({
          type: 'walletAddOffer',
          data: offer,
        });
        break;
      }
    }
  };

  const $encourageMe = /** @type {HTMLInputElement} */ (document.getElementById('encourageMe'));
  
  const walletSend = await connect('wallet', walletRecv).then(walletSend => {
    walletSend({ type: 'walletGetPurses'});
    walletSend({ type: 'walletGetDepositFacetId', brandBoardId: INVITE_BRAND_BOARD_ID});
    return walletSend;
  });

  const apiSend = await connect('api', apiRecv).then(apiSend => {
    apiSend({
      type: 'encouragement/subscribeNotifications',
    });

    $encourageMe.removeAttribute('disabled');
    $encourageMe.addEventListener('click', () => {
      if ($forFree.checked) {
        $encourageForm.target = '';
        apiSend({
          type: 'encouragement/getEncouragement',
        });
      }
      if ($forTip.checked) {
        $encourageForm.target = 'wallet';

        let optWant = {};
        const intoPurse = selects.$intoPurse.value;
        if (intoPurse && intoPurse !== 'remove()') {
          optWant = {
            want: {
              Assurance: {
                pursePetname: intoPurse,
                extent: [],
              },
            },
          };
        }

        const now = Date.now();
        const offer = {
          // JSONable ID for this offer.  This is scoped to the origin.
          id: now,

          // TODO: get this from the invite instead in the wallet. We
          // don't want to trust the dapp on this.
          instanceHandleBoardId: INSTANCE_HANDLE_BOARD_ID,
          installationHandleBoardId: INSTALLATION_HANDLE_BOARD_ID,
      
          proposalTemplate: {
            give: {
              Tip: {
                // The pursePetname identifies which purse we want to use
                pursePetname: selects.$tipPurse.value,
                extent: Number($inputAmount.value),
              },
            },
            ...optWant,
            exit: { onDemand: null },
          },
        };
        apiSend({
          type: 'encouragement/sendInvite',
          data: {
            depositFacetId: zoeInviteDepositFacetId,
            offer,
          },
        });
        alert('Please approve your tip, then close the wallet.')
      }
    });
    
    return apiSend;
  });
}

main();
