import test from 'node:test';
import assert from 'node:assert/strict';
import {requiresSetup} from '../src/lib/setupRequirement';
test('USER stays required until completion; previous prompt is not completion',()=>{
 for(const setupPromptedAt of [null,new Date()]){
 const account={role:'USER',setupCompletedAt:null,setupPromptedAt};
 assert.equal(requiresSetup(account),true);assert.equal(requiresSetup({...account,setupCompletedAt:new Date()}),false);
 }
});
test('ADMIN does not require member onboarding',()=>{
 assert.equal(requiresSetup({role:'ADMIN',setupCompletedAt:null}),false);
});
