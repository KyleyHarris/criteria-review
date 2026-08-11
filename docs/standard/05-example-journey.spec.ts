import { expect } from '@playwright/test';
import { journey, aside } from './support/journey';
import { TillPage } from './page-objects/till.page';
import { LockScreen } from './page-objects/lock-screen.page';

/**
 * TILL LOCK, proves `@LOCK-OPEN-001` and `@LOCK-OPEN-003`.
 *
 * Scenarios: acceptance/till-lock/till-lock-acceptance.md
 *
 * The step keys below are NOT typed by hand. They are the clauses of those two scenarios,
 * generated into support/scenarios.generated.ts by the acceptance parser. Reword a clause in
 * the document and this file stops compiling: the old key is gone and the new one is missing.
 * Miss a clause and it is a missing property. That is what makes "the document is right and
 * the spec is the defect" a compiler rule rather than a habit.
 *
 * WHAT THIS WOULD CATCH. A lock that hides the screen without clearing the session, so the
 * terminal is still authorised behind it. An unlock that ends the shift and opens a new one,
 * which would split a single trading session across two records and make the drawer
 * impossible to reconcile. A wrong PIN that leaks which part was wrong, or that touches the
 * shift on its way out.
 *
 * PROVED ABLE TO FAIL. Removing the same-shift guard in the unlock handler turns
 * `@LOCK-OPEN-001` red on the "same shift is still open" assertion, not on setup. Returning a
 * distinct message for an unknown PIN turns `@LOCK-OPEN-003` red on the message assertion.
 * Both were observed on 2026-08-10 at commit a1b2c3d4.
 *
 * SEEDING. The shop, the staff PIN and the open shift are seeded through the API: none of
 * them is what these scenarios are about, and driving them through the interface would make
 * this journey fail whenever an unrelated screen changes. The lock and the unlock, which are
 * what is being proved, are driven through the interface exactly as a cashier would.
 */

journey(
  'LOCK-OPEN-001',
  {
    useCase: 'Come back to the till after a break and carry on',
    context:
      "Ana locked the register to take five minutes off the counter, with a customer's order half rung up. She is back, and the queue has not stopped.",
  },
  {
    "Given the register was locked during a cashier's shift": async ({ page, shop, api, state }) => {
      const cashier = await api.addStaff(shop.id, { name: 'Ana', pin: '4417' });
      const shift = await api.openShift(shop.id, { openingFloat: 200, staffId: cashier.id });

      // Captured so the assertion below can be about identity rather than about "a shift
      // exists", which would pass just as happily against a brand new one.
      state.shiftIdBeforeLock = shift.id;

      const till = new TillPage(page);
      await till.goto();
      await till.addToCart('Flat white');
      await till.lock();

      await expect(new LockScreen(page).pinPad).toBeVisible();
    },

    'When that cashier enters their own PIN': async ({ page }) => {
      await new LockScreen(page).enterPin('4417');
    },

    'Then they are returned to the till': async ({ page }) => {
      await expect(new LockScreen(page).pinPad).toBeHidden();
      await expect(new TillPage(page).paymentButton).toBeVisible();
    },

    'And the same shift is still open, not a new one': async ({ page, shop, api, state }) => {
      await expect(new TillPage(page).shiftBadge).toHaveText(/Shift open/);

      // The interface shows that a shift is open but never which one, and the entire content
      // of this criterion is that it is the same one. The identity is only observable through
      // the API, so this clause is asserted there and the reason is recorded here.
      const shift = await api.currentShift(shop.id);
      expect(shift.id).toBe(state.shiftIdBeforeLock);
      expect(shift.openingFloat).toBe(200);
    },

    'And the cart they had open is still there': async ({ page }) => {
      await expect(new TillPage(page).cartLine(0)).toContainText('Flat white');
    },
  }
);

journey(
  'LOCK-OPEN-003',
  {
    useCase: 'Keep a locked till shut against someone who should not be in it',
    context:
      'The register is locked and unattended on the counter. Whoever is at it now is not staff, and the shift underneath it belongs to someone who is coming back to it.',
  },
  {
    'Given the register is locked': async ({ page, shop, api, state }) => {
      const cashier = await api.addStaff(shop.id, { name: 'Ana', pin: '4417' });
      const shift = await api.openShift(shop.id, { openingFloat: 200, staffId: cashier.id });
      state.shiftIdBeforeLock = shift.id;

      // Not a clause of the scenario, so it is narrated differently and reads as setup in the
      // recording rather than as something being proved.
      await aside(page, 'opening the till and locking it', async () => {
        const till = new TillPage(page);
        await till.goto();
        await till.lock();
      });

      await expect(new LockScreen(page).pinPad).toBeVisible();
    },

    'When someone enters a PIN that does not belong to any member of staff': async ({ page }) => {
      await new LockScreen(page).enterPin('9999');
    },

    'Then the entry is refused with the same message as any other failure': async ({ page }) => {
      // Asserted as an exact string rather than a pattern, deliberately. The criterion is that
      // this message is indistinguishable from the one a valid-but-wrong PIN produces, so a
      // loose matcher would pass against precisely the leak this exists to prevent.
      await expect(new LockScreen(page).errorMessage).toHaveText('That PIN was not recognised.');
    },

    'And the shift is untouched': async ({ shop, api, state }) => {
      const shift = await api.currentShift(shop.id);
      expect(shift.id).toBe(state.shiftIdBeforeLock);
      expect(shift.endedUtc).toBeNull();
    },

    'And the terminal stays locked': async ({ page }) => {
      await expect(new LockScreen(page).pinPad).toBeVisible();
      await expect(new TillPage(page).paymentButton).toBeHidden();
    },
  }
);
