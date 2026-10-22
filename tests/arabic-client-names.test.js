import test from 'node:test';
import assert from 'node:assert/strict';
import {arabicClientName,isValidArabicClientName} from '../lib/arabic-client-names.js';

test('Arabic names in reference Private Sessions transliterate locally',()=>{
 assert.equal(arabicClientName('Jana Bleibel'),'جانا بليبل');
 assert.equal(arabicClientName('Ali Akhdar'),'علي أخضر');
 assert.equal(arabicClientName('Mohamad Youssef'),'محمد يوسف');
 assert.equal(arabicClientName('Élie Haddad'),'إيلي حداد');
});

test('Staff Arabic override is preferred while original English name remains unchanged',()=>{
 const english='Jana Bleibel';
 assert.equal(arabicClientName(english,'جنى بليبل'),'جنى بليبل');
 assert.equal(english,'Jana Bleibel');
 assert.equal(arabicClientName(english,'  جنى بليبل  '),'جنى بليبل');
});

test('Arabic names already written in Arabic remain as entered',()=>{
 assert.equal(arabicClientName('علي أخضر'),'علي أخضر');
 assert.equal(arabicClientName('جنى - Ali'),'جنى - علي');
});

test('Unknown Latin names still produce an Arabic-script approximation offline',()=>{
 const result=arabicClientName('Unknown Name');
 assert.match(result,/[ء-ي]/);
 assert.doesNotMatch(result,/[A-Za-z]/);
 assert.equal(arabicClientName(''),'اسم غير معروف');
});

test('Arabic override validation rejects Latin or excessively long names',()=>{
 assert.equal(isValidArabicClientName(''),true);
 assert.equal(isValidArabicClientName('جنى بليبل'),true);
 assert.equal(isValidArabicClientName('علي 2'),true);
 assert.equal(isValidArabicClientName('Jana'),false);
 assert.equal(isValidArabicClientName('علي Ali'),false);
 assert.equal(isValidArabicClientName('أ'.repeat(121)),false);
});
