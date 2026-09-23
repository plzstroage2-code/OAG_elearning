import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

test('database migration, role enforcement, atomic awards, recovery and protected history', async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            create role anon; create role authenticated;
            create schema auth;
            create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
            create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
            grant usage on schema public,auth to authenticated,anon;
        `);
        await db.exec(readFileSync('supabase/migrations/000000_init.sql','utf8'));
        // Simulate an older quickstart policy: new restrictive guards must override it.
        await db.exec('create policy old_open_policy on public.prizes for select to authenticated using (true)');
        await db.exec(readFileSync('supabase/migrations/000001_production.sql','utf8'));
        const identity = async (role) => {
            await db.exec('reset role');
            await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:'11111111-1111-4111-8111-111111111111',app_metadata:{lucky_draw_role:role},user_metadata:{lucky_draw_role:'admin'}})]);
            await db.exec(role === 'anon' ? 'set role anon' : 'set role authenticated');
        };
        const command = (action, payload={}) => db.query('select public.manage_event($1,$2::jsonb) as state',[action,JSON.stringify(payload)]);
        await identity('anon');
        await assert.rejects(db.query('select * from public.participants'),/permission denied/);
        await assert.rejects(command('reset_event'),/permission denied/);
        await identity('unapproved');
        assert.equal((await db.query('select * from public.prizes')).rows.length,0);
        await assert.rejects(command('reset_event'),/Admin access required/);
        await identity('display');
        assert.equal((await db.query('select * from public.prizes')).rows.length,3);
        assert.equal((await db.query('select * from public.draw_logs')).rows.length,0);
        await assert.rejects(command('begin_draw'),/Admin access required/);
        await assert.rejects(db.exec("insert into public.participants(id,name) values('bad','bad')"),/permission denied/);
        await identity('admin');
        await assert.rejects(db.exec("insert into public.participants(id,name) values('bad','bad')"),/permission denied/);
        await command('import_participants',{rows:[{id:'001',name:'Winner One',department:'IT'}]});
        const prize = (await db.query('select * from public.prizes where total_amount=1')).rows[0];
        const first = (await command('begin_draw',{prizeId:prize.id})).rows[0].state;
        assert.equal(first.targetWinnerName,'Winner One');
        assert.equal(first.poolCount,1);
        await assert.rejects(command('begin_draw',{prizeId:prize.id}),/draw is running/);
        await assert.rejects(command('ready'),/draw is running/);
        assert.equal((await db.query('select * from public.draw_logs')).rows.length,1);
        assert.equal((await db.query('select status from public.participants')).rows[0].status,'Winner');
        const recovered = (await db.query('select public.get_event_state() as state')).rows[0].state;
        assert.equal(recovered.drawId,first.drawId);
        await db.exec("reset role; update public.event_state set state=jsonb_set(state,'{startedAt}',to_jsonb(clock_timestamp()-interval '20 seconds')); set role authenticated;");
        await command('ready');
        await assert.rejects(command('begin_draw',{prizeId:prize.id}),/fully drawn/);
        await command('import_participants',{rows:[{id:'001',name:'Renamed',department:'HR'}]});
        assert.equal((await db.query('select status from public.participants')).rows[0].status,'Winner');
        assert.equal((await db.query('select participant_name from public.draw_logs')).rows[0].participant_name,'Winner One');
        await assert.rejects(command('delete_prize',{id:prize.id}),/foreign key constraint/);
        await command('reset_event');
        assert.equal((await db.query('select * from public.draw_logs')).rows.length,0);
        // Force the history insert to fail: participant/prize updates must roll back too.
        await db.exec("reset role; alter table public.draw_logs add constraint test_failure check (participant_name <> 'Renamed'); set role authenticated;");
        await assert.rejects(command('begin_draw',{prizeId:prize.id}),/test_failure/);
        assert.equal((await db.query('select status from public.participants')).rows[0].status,'Active');
        assert.equal((await db.query('select drawn_amount from public.prizes where id=$1',[prize.id])).rows[0].drawn_amount,0);
        await assert.rejects(command('prize_amount',{id:prize.id,amount:0}),/at least 1/);
    } finally { await db.close(); }
});

function loadModel(path) {
    const context = { exports:{}, Intl, Date };
    runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, context);
    return context.exports;
}
test('database clock drives countdown, shuffle and reload recovery', () => {
    const { projectDrawState } = loadModel('src/lib/drawStateModel.ts');
    const start = Date.parse('2026-09-23T00:00:00Z');
    const state = {phase:'SHUFFLE',startedAt:new Date(start).toISOString(),spinDurationMs:7000};
    assert.equal(projectDrawState(state,start).countdownValue,3);
    assert.equal(projectDrawState(state,start+2400).countdownValue,1);
    assert.equal(projectDrawState(state,start+3600).phase,'SHUFFLE');
    assert.equal(projectDrawState(state,start+10600).phase,'WINNER');
    assert.equal(projectDrawState(state,start+60000).phase,'WINNER');
});
test('history numbers survive filtering and use Bangkok calendar dates', () => {
    const { selectHistory, historyDay } = loadModel('src/lib/winnerHistory.ts');
    const filters = {search:'',department:'',prize:'',from:'',to:''};
    const logs = [{id:'b',participant_id:'001',drawn_at:'2026-09-23T00:00:00Z',participant:{name:'Second',department:'IT'}},
        {id:'a',participant_id:'999',drawn_at:'2026-09-22T17:01:00Z',participant:{name:'First',department:'HR'}}];
    assert.equal(historyDay(logs[1].drawn_at),'2026-09-23');
    assert.equal(selectHistory(logs,{...filters,to:'2026-09-23'},'number','asc').length,2);
    assert.equal(selectHistory(logs,{...filters,department:'IT'},'number','asc')[0].awardNumber,2);
    assert.equal(selectHistory(logs,filters,'number','asc')[0].id,'a');
});
