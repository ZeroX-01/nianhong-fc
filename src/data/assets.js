/* 资源清单：与 docs/ART_MANIFEST.md 严格对应。
 * 缺失的资源不会导致崩溃 —— BootScene 会为其生成占位纹理并在控制台列出。 */
(function (SB) {
  'use strict';

  var I = function (key, path) { return { key: key, path: path }; };
  var S = function (key, path, w, h, n) { return { key: key, path: path, w: w, h: h, n: n }; };

  SB.ASSETS = {
    imgBase: 'assets/img/',
    fontBase: 'assets/font/',
    audioManifest: 'assets/audio/manifest.json',

    /* ---------------- 单帧图片 ---------------- */
    images: [
      /* 客厅 */
      I('bg_room', 'room/bg_room.png'),
      I('window', 'room/window.png'),
      I('tv_cabinet', 'room/tv_cabinet.png'),
      I('lace_cloth', 'room/lace_cloth.png'),
      I('tv_crt', 'room/tv_crt.png'),
      I('tv_antenna', 'room/tv_antenna.png'),
      I('console', 'room/console.png'),
      I('controller_1p', 'room/controller_1p.png'),
      I('controller_2p', 'room/controller_2p.png'),
      I('cable', 'room/cable.png'),
      I('sofa', 'room/sofa.png'),
      I('thermos', 'room/thermos.png'),
      I('shoebox', 'room/shoebox.png'),
      I('desk_small', 'room/desk_small.png'),
      I('calendar', 'room/calendar.png'),
      I('award', 'room/award.png'),
      I('clock_wall', 'room/clock_wall.png'),
      I('poster', 'room/poster.png'),
      I('slipper', 'room/slipper.png'),
      I('popsicle', 'room/popsicle.png'),
      /* 角色附属 */
      I('money_note', 'char/money_note.png'),
      /* 卡带 */
      I('cart_big_shell', 'cart/cart_big_shell.png'),
      /* 集市 / 发小家 */
      I('bg_market', 'market/bg_market.png'),
      I('stall', 'market/stall.png'),
      I('umbrella', 'market/umbrella.png'),
      I('bicycle', 'market/bicycle.png'),
      I('crate', 'market/crate.png'),
      I('bg_friend', 'market/bg_friend.png'),
      /* UI */
      I('panel', 'ui/panel.png'),
      I('panel_dark', 'ui/panel_dark.png'),
      I('icon_coin', 'ui/icon_coin.png'),
      I('icon_cart', 'ui/icon_cart.png'),
      I('icon_clock', 'ui/icon_clock.png'),
      I('icon_alert', 'ui/icon_alert.png'),
      I('touch_dpad', 'ui/touch_dpad.png'),
      I('title_logo', 'ui/title_logo.png'),
      I('title_sub', 'ui/title_sub.png'),
      /* CRT */
      I('scanline', 'crt/scanline.png'),
      I('aperture', 'crt/aperture.png'),
      I('vignette', 'crt/vignette.png'),
      I('glass', 'crt/glass.png'),
      I('flash', 'crt/flash.png'),
      /* 小游戏背景 */
      I('contra_bg', 'games/contra/bg_jungle.png'),
      I('mario_bg', 'games/mario/bg_sky.png'),
      I('mario_cloud', 'games/mario/cloud.png'),
      I('mario_bush', 'games/mario/bush.png'),
      I('mario_castle', 'games/mario/castle.png'),
      I('fight_bg', 'games/fight/bg_stage.png'),
      I('fight_hudbar', 'games/fight/hud_bar.png')
    ],

    /* ---------------- 多帧 sprite sheet ---------------- */
    sheets: [
      S('door', 'room/door.png', 62, 140, 3),
      S('fish_tank', 'room/fish_tank.png', 44, 38, 2),
      S('homework_book', 'room/homework_book.png', 42, 30, 2),
      S('lightbulb', 'room/lightbulb.png', 18, 26, 2),

      S('kid', 'char/kid.png', 24, 44, 6),
      S('mom', 'char/mom.png', 28, 54, 6),
      S('friend', 'char/friend.png', 28, 48, 4),
      S('vendor_lao', 'char/vendor_lao.png', 30, 52, 3),
      S('vendor_zhang', 'char/vendor_zhang.png', 28, 52, 3),
      S('coin', 'char/coin.png', 12, 12, 4),

      S('cart_fingers', 'cart/cart_fingers.png', 168, 26, 3),
      S('cart_scratch', 'cart/cart_scratch.png', 168, 116, 4),
      S('breath_puff', 'cart/breath_puff.png', 40, 40, 6),
      S('dust', 'cart/dust.png', 6, 6, 4),
      S('spark', 'cart/spark.png', 8, 8, 4),

      S('btn', 'ui/btn.png', 52, 20, 3),
      S('arrow', 'ui/arrow.png', 14, 14, 2),
      S('heart', 'ui/heart.png', 12, 12, 2),
      S('touch_btn', 'ui/touch_btn.png', 52, 52, 2),
      S('focus_ring', 'ui/focus_ring.png', 24, 24, 2),

      S('snow', 'crt/snow.png', 360, 270, 4),
      S('glitch', 'crt/glitch.png', 360, 270, 3),

      S('contra_hero', 'games/contra/hero.png', 20, 26, 8),
      S('contra_soldier', 'games/contra/enemy_soldier.png', 18, 24, 4),
      S('contra_turret', 'games/contra/enemy_turret.png', 24, 24, 3),
      S('contra_boss', 'games/contra/boss_wall.png', 96, 88, 3),
      S('contra_bullet', 'games/contra/bullet.png', 6, 6, 2),
      S('contra_ebullet', 'games/contra/bullet_enemy.png', 6, 6, 2),
      S('contra_powerup', 'games/contra/powerup.png', 14, 14, 4),
      S('contra_tiles', 'games/contra/tiles.png', 16, 16, 8),
      S('contra_boom', 'games/contra/explosion.png', 24, 24, 5),

      S('tank_p', 'games/tank/tank_player.png', 16, 16, 8),
      S('tank_ea', 'games/tank/tank_enemy_a.png', 16, 16, 8),
      S('tank_eb', 'games/tank/tank_enemy_b.png', 16, 16, 8),
      S('tank_ec', 'games/tank/tank_enemy_c.png', 16, 16, 8),
      S('tank_bullet', 'games/tank/bullet.png', 6, 6, 4),
      S('tank_tiles', 'games/tank/tiles.png', 16, 16, 6),
      S('tank_base', 'games/tank/base.png', 32, 32, 2),
      S('tank_boom', 'games/tank/explosion.png', 32, 32, 5),
      S('tank_item', 'games/tank/item.png', 16, 16, 6),
      S('tank_spawn', 'games/tank/spawn.png', 16, 16, 4),

      S('mario_hero', 'games/mario/hero.png', 16, 24, 7),
      S('mario_hero_big', 'games/mario/hero_big.png', 16, 32, 7),
      S('mario_mush', 'games/mario/enemy_mush.png', 16, 16, 3),
      S('mario_shell', 'games/mario/enemy_shell.png', 16, 18, 4),
      S('mario_tiles', 'games/mario/tiles.png', 16, 16, 10),
      S('mario_item', 'games/mario/item.png', 16, 16, 4),
      S('mario_coin', 'games/mario/coin_spin.png', 16, 16, 4),
      S('mario_flag', 'games/mario/flag.png', 14, 14, 2),

      S('fight_p1', 'games/fight/p1.png', 40, 54, 10),
      S('fight_p2', 'games/fight/p2.png', 40, 54, 10),
      S('fight_spark', 'games/fight/hit_spark.png', 24, 24, 4),
      S('fight_portrait', 'games/fight/hud_portrait.png', 28, 28, 2)
    ],

    fonts: [
      { key: 'pix12', png: 'pix12.png', xml: 'pix12.xml' },
      { key: 'pix16', png: 'pix16.png', xml: 'pix16.xml' }
    ]
  };

  /* 12 张卡带的小图与近景贴纸，按编号批量登记 */
  (function () {
    for (var i = 1; i <= 12; i++) {
      var id = (i < 10 ? '0' : '') + i;
      SB.ASSETS.images.push(I('cart_' + id, 'cart/cart_' + id + '.png'));
      SB.ASSETS.images.push(I('cart_label_' + id, 'cart/cart_label_' + id + '.png'));
    }
  })();

})(window.SB);
