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

  const { rejectOffer } = makeZoeHelpers(zcf);

  const { issuer, amountMath: assuranceAmountMath, mint } = produceIssuer(
    'Assurance',
    'set',
  );

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
      // and the assurance to the user
      const newUserAllocation = {
        Tip: tipAmountMath.getEmpty(),
      };

      // Give the assurance to the user, if they requested it.
      if (zcf.getCurrentAllocation(offerHandle).Assurance) {
        newUserAllocation.Assurance = mint.mintPayment(
          assuranceAmountMath.make(
            harden([{ encouragement, serial: count + 1 }]),
          ),
        );
      }

      zcf.reallocate(
        harden([adminOfferHandle, offerHandle]),
        harden([newAdminAllocation, newUserAllocation]),
        harden(['Tip']),
      );
    }
    zcf.complete(harden([offerHandle]));
    count += 1;
    updateNotification();
    return encouragement;
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
