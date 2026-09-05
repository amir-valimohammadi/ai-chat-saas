import assert from 'node:assert/strict';
import { formatPlanPrice, rialToTomanInput, tomanInputToRial, suggestedSubscriptionPrice } from '../lib/plan-money.ts';

for (const [toman, rial] of [['390000', 3900000], ['890000', 8900000], ['1990000', 19900000], ['0', 0], ['12.345', 123.45], ['999999999.999', 9999999999.99]]) {
    assert.equal(tomanInputToRial(toman), rial);
    assert.equal(rialToTomanInput(rial), toman);
}
for (const value of ['', '-1', '1e6', '1,000', '12.3456', '1000000000', 'NaN']) assert.ok(Number.isNaN(tomanInputToRial(value)));
assert.equal(formatPlanPrice(3900000), '۳۹۰٬۰۰۰ تومان');
assert.equal(formatPlanPrice(0), 'رایگان');
assert.equal(suggestedSubscriptionPrice(8900000, 'monthly', 'IRR'), '8900000');
assert.equal(suggestedSubscriptionPrice(8900000, 'quarterly', 'IRR'), '26700000');
assert.equal(suggestedSubscriptionPrice(8900000, 'yearly', 'IRT'), '10680000');
assert.equal(suggestedSubscriptionPrice(8900000, 'monthly', 'USD'), '');
console.log('Plan money: 25 assertions passed.');
