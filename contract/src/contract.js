// @ts-check
import harden from '@agoric/harden';
import produceIssuer from '@agoric/ertp';
import { produceNotifier } from '@agoric/notifier';
import { makeZoeHelpers } from '@agoric/zoe/src/contractSupport/zoeHelpers';

/**
 * This contract does a few interesting things.
 *
 * @type {import('@agoric/zoe').MakeContract}
 */
export const makeContract = harden(zcf => {
  let count = 0;
  const messages = {
    basic: `You're doing great!`,
    premium: `Wow, just wow. I have never seen such talent!`,
  };
  const { notifier, updater } = produceNotifier();
  let adminOfferHandle;
  const tipAmountMath = zcf.getAmountMaths(harden(['Tip'])).Tip;

  const { escrowAndAllocateTo, rejectOffer } = makeZoeHelpers(zcf);

  const { issuer, amountMath: assuranceAmountMath, mint } = produceIssuer(
    'Assurance',
    'set',
  );

  // Keep this promise for later, but track any error we get from it.
  const addAssuranceP = zcf.addNewIssuer(issuer, 'Assurance');
  addAssuranceP.catch(e => console.error('Cannot add Assurance issuer', e));

  const updateNotification = () => {
    updater.updateState({ messages, count });
  };
  updateNotification();

  const adminHook = offerHandle => {
    adminOfferHandle = offerHandle;
    return `admin invite redeemed`;
  };

  const encouragementHook = offerHandle => {
    // if the adminOffer is no longer active (i.e. the admin cancelled
    // their offer and retrieved their tips), we just don't give any
    // encouragement.
    if (!zcf.isOfferActive(adminOfferHandle)) {
      rejectOffer(offerHandle, `We are no longer giving encouragement`);
    }

    const userTipAllocation = zcf.getCurrentAllocation(offerHandle).Tip;
    let p = Promise.resolve();
    let encouragement = messages.basic;
    // if the user gives a tip, we provide a premium encouragement message
    if (
      userTipAllocation &&
      tipAmountMath.isGTE(userTipAllocation, tipAmountMath.make(1))
    ) {
      encouragement = messages.premium;
      // reallocate the tip to the adminOffer
      const adminTipAllocation = zcf.getCurrentAllocation(adminOfferHandle).Tip;
      const newAdminAllocation = {
        Tip: tipAmountMath.add(adminTipAllocation, userTipAllocation),
      };
      const newUserAllocation = {
        Tip: tipAmountMath.getEmpty(),
      };

      // Check if the user made a request for Assurance.
      const { proposal } = zcf.getOffer(offerHandle);
      if (proposal.want && proposal.want.Assurance) {
        // Just create a non-fungible serial number.
        const assuranceAmount = harden(
          assuranceAmountMath.make(harden([count + 1])),
        );
        p = addAssuranceP.then(_ =>
          escrowAndAllocateTo({
            amount: assuranceAmount,
            payment: mint.mintPayment(assuranceAmount),
            keyword: 'Assurance',
            recipientHandle: offerHandle,
          }),
        );
      }

      zcf.reallocate(
        harden([adminOfferHandle, offerHandle]),
        harden([newAdminAllocation, newUserAllocation]),
        harden(['Tip']),
      );
    }
    return p.then(_ => {
      zcf.complete(harden([offerHandle]));
      count += 1;
      updateNotification();
      return encouragement;
    });
  };

  const makeInvite = () =>
    zcf.makeInvitation(encouragementHook, 'encouragement');

  return harden({
    invite: zcf.makeInvitation(adminHook, 'admin'),
    publicAPI: {
      getNotifier() {
        return notifier;
      },
      makeInvite,
      getFreeEncouragement() {
        count += 1;
        updateNotification();
        return messages.basic;
      },
      getAssuranceIssuer() {
        return issuer;
      },
    },
  });
});
