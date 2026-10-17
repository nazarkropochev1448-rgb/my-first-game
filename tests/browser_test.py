"""Functional tests against a real static server; uses installed Chromium."""
import json
import os
import unittest
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

BASE=os.environ.get('GAME_TEST_URL','http://127.0.0.1:8000')
class GameTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.pw=sync_playwright().start()
  cls.browser=cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
 @classmethod
 def tearDownClass(cls):
  cls.browser.close();cls.pw.stop()
 def setUp(self):
  self.context=self.browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
  self.page=self.context.new_page();self.page.set_default_timeout(6000);self.errors=[]
  self.page.on('pageerror',lambda e:self.errors.append(str(e)))
  self.page.clock.install(time=datetime(2026,10,17,12,tzinfo=timezone.utc))
  self.page.clock.set_fixed_time(datetime(2026,10,17,12,tzinfo=timezone.utc))
  self.page.goto(BASE+'/?test');self.page.locator('#closeModal').click()
 def tearDown(self):
  self.context.close();self.assertEqual(self.errors,[])
 def state(self):return self.page.evaluate('window.__gameTest.get()')
 def fixture(self,script=''):
  self.page.evaluate('()=>{const g=window.__gameTest,x=g.initial();'+script+';g.set(x)}')
 def action(self,script):return self.page.evaluate('()=>{const g=window.__gameTest;'+script+'}')
 def time(self,seconds):
  now=self.page.evaluate('Date.now()');self.page.clock.set_fixed_time(datetime.fromtimestamp(now/1000+seconds,timezone.utc));self.action('g.tick()')
 def tab(self,name):self.page.locator('#nav [data-tab="'+name+'"]').click()
 def test_new_game_tap_purchase_upgrade_workers(self):
  self.assertEqual(self.state()['wallets'][0],50)
  self.page.locator('#heroTap').click();self.assertEqual(self.state()['taps'],1)
  self.tab('Владения');self.page.locator('[data-build="0"]').click();self.assertEqual(self.state()['biz'][0][0]['level'],1)
  self.action('g.buyBiz(0)');self.assertEqual(self.state()['biz'][0][0]['level'],1) # insufficient funds
  self.time(100);self.page.locator('[data-build="0"]').click();self.page.locator('[data-worker="0"]').click()
  self.assertEqual(self.state()['biz'][0][0]['level'],2);self.assertEqual(self.state()['biz'][0][0]['workers'],1)
  before=self.state()['wallets'][0];self.time(10);self.assertAlmostEqual(self.state()['wallets'][0]-before,27,delta=.2)
  self.page.locator('[data-fire="0"]').click();self.assertEqual(self.state()['biz'][0][0]['workers'],0)
 def test_production_live_stocks_and_sales(self):
  self.fixture('x.biz[0][0].level=1');self.tab('Рынок');self.assertTrue(self.page.locator('[data-sell="0"]').is_disabled())
  self.time(180);self.assertIn('На складе: 10',self.page.locator('#content').inner_text())
  self.assertTrue(self.page.locator('[data-sell="0"]').is_enabled());before=self.state()['wallets'][0]
  self.page.locator('[data-sell="0"]').click();self.assertEqual(self.state()['biz'][0][0]['stock'],0);self.assertAlmostEqual(self.state()['wallets'][0]-before,30,delta=.1)
 def test_five_location_progression_and_titles(self):
  # Exercise real production and spending, accelerating time rather than granting quests.
  for loc in range(5):
   self.action('for(let k=0;k<10;k++)g.doTap();for(let j=0;j<2;j++)g.buyBiz(j)')
   # Earn the second business if initial capital is insufficient.
   self.time(250);self.action('g.buyBiz(1)');self.time(180)
   self.action('g.completeQuest();g.completeQuest()')
   self.assertEqual(self.state()['quests'][loc],2)
   self.assertEqual(self.state()['reputation'][loc],4)
   self.time(700)
   if loc<4:
    self.action('g.unlock()');self.assertEqual(self.state()['loc'],loc+1);self.page.locator('#closeModal').click()
  self.action('g.help();g.help()')
  for _ in range(5):self.action('g.rankUp()')
  self.assertEqual(self.state()['rank'],5)
 def test_exchange_caravan_and_locked_travel(self):
  self.action('g.go(4)');self.assertEqual(self.state()['loc'],0)
  self.fixture('x.unlocked=1;x.wallets[0]=105;x.biz[0][0]={level:1,workers:0,stock:20}')
  self.action('g.exchange()');self.assertAlmostEqual(self.state()['wallets'][0],5,delta=.1);self.assertEqual(self.state()['wallets'][1],90)
  self.action('g.caravan(0)');self.assertEqual(self.state()['wallets'][1],135);self.assertEqual(self.state()['biz'][0][0]['stock'],10)
  self.action('g.caravan(0);g.caravan(0)');self.assertEqual(self.state()['biz'][0][0]['stock'],0)
 def test_gear_bonus_not_retroactive(self):
  self.fixture('x.wallets[0]=1000;x.biz[0][0].level=1')
  self.time(100);self.action("g.buyGear('boots')");self.assertAlmostEqual(self.state()['wallets'][0],820,delta=.2)
  self.time(10);self.assertAlmostEqual(self.state()['wallets'][0],831,delta=.2)
  self.action("g.buyGear('boots')");self.time(10);self.assertAlmostEqual(self.state()['wallets'][0],841,delta=.2)
  self.action("g.buyGear('ring');g.doTap()");self.assertAlmostEqual(self.state()['wallets'][0],752.2,delta=.2)
 def test_reload_offline_and_single_checkpoint(self):
  self.fixture('x.biz[0][0].level=1');self.time(20);self.action('g.save()');self.page.reload();self.page.wait_for_function('!!window.__gameTest')
  self.assertAlmostEqual(self.state()['wallets'][0],70,delta=.2)
  self.time(60);before=self.state()['wallets'][0]
  self.page.evaluate("document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'))")
  self.assertAlmostEqual(self.state()['wallets'][0],before,delta=.1)
  raw=self.state();raw['last']=self.page.evaluate('Date.now()-86400000');self.context.add_init_script("localStorage.setItem('knyazi_rebuilt_v4',"+json.dumps(json.dumps(raw))+")")
  self.page.reload();self.page.wait_for_function('!!window.__gameTest');self.assertAlmostEqual(self.state()['wallets'][0],before+7200,delta=.2)
 def test_backup_restore_invalid_and_reset(self):
  self.fixture('x.wallets[0]=123;x.rank=2');self.tab('Настройки')
  with self.page.expect_download() as download:self.page.locator('#backup').click()
  data=json.loads(Path(download.value.path()).read_text());self.assertEqual(data['rank'],2)
  self.page.on('dialog',lambda d:d.accept())
  self.page.locator('#restore').set_input_files({'name':'save.json','mimeType':'application/json','buffer':json.dumps(data).encode()})
  self.page.wait_for_function("document.getElementById('toast').textContent==='Сохранение восстановлено'");self.assertEqual(self.state()['rank'],2)
  self.page.locator('#restore').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{bad'})
  self.page.wait_for_function("document.getElementById('toast').textContent.includes('Не удалось прочитать')");self.assertEqual(self.state()['rank'],2)
  self.page.locator('#reset').click();self.assertEqual(self.state()['wallets'][0],50);self.assertEqual(self.state()['rank'],0)
 def test_corrupt_save_is_not_overwritten(self):
  self.context.add_init_script("localStorage.setItem('knyazi_rebuilt_v4','{bad')");self.page.reload();self.page.wait_for_function('!!window.__gameTest');self.page.clock.fast_forward(6000)
  self.assertEqual(self.page.evaluate("localStorage.getItem('knyazi_rebuilt_v4')"),'{bad')
 def test_second_tab_cannot_overwrite(self):
  second=self.context.new_page();second.goto(BASE+'/');self.assertIn('Летопись уже открыта',second.locator('body').inner_text())
  second.close();self.page.locator('#heroTap').click();self.assertEqual(self.state()['taps'],1)
 def test_menus_mobile_layout_and_assets(self):
  for width in [320,375,390,768,1280]:
   self.page.set_viewport_size({'width':width,'height':844})
   for name in ['Главная','Владения','Рынок','Задания','Герой','Карта','Летопись','Настройки']:
    self.tab(name);self.assertTrue(self.page.locator('#content').inner_text().strip())
    self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,name))
   self.tab('Главная');self.assertTrue(self.page.locator('.hero-art').evaluate('(img)=>img.complete&&img.naturalWidth>0'))
  self.page.screenshot(path='/tmp/game-desktop.png',full_page=True)
  self.page.set_viewport_size({'width':390,'height':844});self.page.screenshot(path='/tmp/game-mobile.png',full_page=True)
 def test_optional_recipes_and_gear_resale(self):
  for loc in range(5):
   self.fixture('x.loc='+str(loc)+';x.unlocked='+str(loc)+';x.biz['+str(loc)+'].forEach(b=>{b.level=1;b.stock=10})')
   before=self.state()['biz'][loc]
   self.action('g.craft()');after=self.state()['biz'][loc]
   self.assertNotEqual(before,after)
   self.assertTrue(all(b['stock']>=0 for b in after))
   self.action('for(let j=0;j<100;j++)g.craft()')
   self.assertTrue(all(b['stock']>=0 for b in self.state()['biz'][loc]))
  self.fixture('x.wallets[0]=1000')
  self.action("g.buyGear('ring');g.sellGear('ring');g.sellGear('ring')")
  self.assertEqual(self.state()['wallets'][0],955);self.assertEqual(self.state()['owned'],[]);self.assertEqual(self.state()['equipped'],[])
 def test_remaining_button_bindings(self):
  self.fixture('x.wallets[0]=10000;x.biz[0].forEach(b=>{b.level=1;b.stock=30})')
  self.page.locator('[data-plot="0"]').click();self.assertIn('Предприятия',self.page.locator('#content').inner_text())
  self.tab('Рынок');self.page.locator('#craft').click();self.page.locator('[data-sellall="0"]').click();self.page.locator('[data-gear="ring"]').click()
  self.tab('Герой');self.page.locator('[data-gear="ring"]').click();self.page.locator('[data-gear="ring"]').click();self.page.locator('[data-sellgear="ring"]').click()
  self.time(180);self.tab('Задания');self.page.locator('#questComplete').click();self.page.locator('#questComplete').click();self.page.locator('#help').click();self.page.locator('#unlock').click();self.page.locator('#closeModal').click()
  self.tab('Карта');self.page.locator('[data-go="0"]').click();self.assertEqual(self.state()['loc'],0)
  self.tab('Рынок');self.page.locator('#exchange').click();self.page.locator('[data-caravan="1"]').click()
  self.tab('Летопись');self.page.locator('[data-story="0"]').click();self.page.locator('#closeModal').click()
  self.tab('Настройки');self.page.locator('#introAgain').click();self.page.locator('#closeModal').click()
  self.fixture('x.wallets[0]=1000;x.reputation[0]=10');self.tab('Герой');self.page.locator('#rankUp').click();self.assertEqual(self.state()['rank'],1)
 def test_sustained_session_keeps_buttons_and_state(self):
  self.fixture('x.biz[0][0].level=1');self.tab('Рынок')
  self.action('for(let n=0;n<1000;n++)g.doTap()')
  self.time(3600);self.assertEqual(self.state()['taps'],1000)
  self.assertAlmostEqual(self.state()['biz'][0][0]['stock'],200,delta=.1)
  self.page.locator('[data-sellall="0"]').click();self.assertEqual(self.state()['biz'][0][0]['stock'],0)
 def test_limits_and_invalid_actions(self):
  self.fixture('x.wallets[0]=100000;x.biz[0][0]={level:100,workers:5,stock:0}')
  self.action("g.buyBiz(0);g.worker(0);g.buyBiz(-1);g.buyGear('bad');g.go(1.5);g.completeQuest()")
  self.assertEqual(self.state()['biz'][0][0],{'level':100,'workers':5,'stock':0});self.assertEqual(self.state()['quests'][0],0)

if __name__=='__main__':unittest.main(verbosity=2)
