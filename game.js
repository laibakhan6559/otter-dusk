/* Otter Dusk - a tiny offline river game. Plain JS + canvas, no dependencies. */
(function () {
  'use strict';

  // ---------- Setup ----------
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  function $(id) { return document.getElementById(id); }

  var ui = {
    menu: $('menu'), over: $('over'), pause: $('pauseScreen'), hud: $('hud'),
    score: $('score'), lanterns: $('lanterns'), hearts: $('hearts'),
    best: $('best'), finalScore: $('finalScore'), finalBest: $('finalBest'),
    finalLanterns: $('finalLanterns'), newBest: $('newBest'), pauseBtn: $('pauseBtn')
  };
  var soundBtns = document.querySelectorAll('.sound-btn');

  var TAU = Math.PI * 2;
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var best = parseInt(store.get('otterDusk.best', '0'), 10) || 0;
  var soundOn = store.get('otterDusk.sound', '1') === '1';

  // ---------- Sound (tiny WebAudio beeps, no files) ----------
  var actx = null;
  function unlockAudio() {
    try {
      if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    } catch (e) {}
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (!soundOn || !actx) return;
    try {
      var o = actx.createOscillator(), g = actx.createGain(), now = actx.currentTime;
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, now);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
      g.gain.setValueAtTime(vol || 0.08, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(now); o.stop(now + dur + 0.02);
    } catch (e) {}
  }
  var sfx = {
    start: function () { tone(440, 0.16, 'triangle', 0.08, 700); },
    collect: function () { tone(660, 0.12, 'triangle', 0.09, 990); setTimeout(function () { tone(990, 0.15, 'triangle', 0.07); }, 70); },
    hit: function () { tone(190, 0.28, 'sawtooth', 0.09, 60); },
    over: function () { tone(320, 0.55, 'triangle', 0.1, 90); }
  };
  function refreshSoundBtns() {
    for (var i = 0; i < soundBtns.length; i++) soundBtns[i].textContent = 'Sound: ' + (soundOn ? 'On' : 'Off');
  }

  // ---------- View (everything is responsive via a logical coordinate system) ----------
  var dpr = 1, scale = 1, VW = 360, VH = 600, riverX0 = 0, riverW = 360;
  var boat = { x: 180, y: 450, vx: 0, target: 180 };

  function boatMin() { return riverX0 + 54; }
  function boatMax() { return riverX0 + riverW - 54; }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = window.innerWidth, ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    scale = Math.min(cw / 360, ch / 600);
    VW = cw / scale;
    VH = ch / scale;
    riverW = Math.min(VW, 480);
    riverX0 = (VW - riverW) / 2;
    boat.y = VH * 0.76;
    boat.x = clamp(boat.x, boatMin(), boatMax());
    boat.target = clamp(boat.target, boatMin(), boatMax());
    initStreaks();
    initDecor();
  }

  // ---------- Game state ----------
  var state = 'menu'; // menu | play | pause | over
  var clock = 0, t = 0, speed = 0, dist = 0, scroll = 0;
  var lanternCount = 0, lives = 3, invuln = 0, shake = 0;
  var obstacles = [], pickups = [], decor = [], particles = [], streaks = [];
  var spawnGap = 0, decorGap = 0;
  var lastScoreShown = -1, lastHearts = '', lastLanterns = -1;

  function score() { return Math.floor(dist / 12) + lanternCount * 10; }

  function initStreaks() {
    streaks = [];
    var n = Math.round((VW * VH) / 9000);
    for (var i = 0; i < n; i++) streaks.push({ x: rand(-10, VW + 10), y: rand(-40, VH), len: rand(14, 40), sp: rand(0.8, 1.25) });
  }
  function initDecor() {
    decor = [];
    for (var i = 0; i < 7; i++) addDecor(rand(0, VH));
  }
  function addDecor(y) {
    decor.push({ x: rand(riverX0 + 46, riverX0 + riverW - 46), y: y, s: rand(10, 16), flower: Math.random() < 0.4, rot: rand(0, TAU) });
  }

  function reset() {
    t = 0; dist = 0; scroll = 0; lanternCount = 0; lives = 3; invuln = 0; shake = 0;
    obstacles = []; pickups = []; particles = [];
    spawnGap = 230; speed = 150;
    boat.x = (riverX0 * 2 + riverW) / 2; boat.target = boat.x; boat.vx = 0;
    lastScoreShown = -1; lastHearts = ''; lastLanterns = -1;
    updateHud();
  }

  function updateHud() {
    var s = score();
    if (s !== lastScoreShown) { ui.score.textContent = s; lastScoreShown = s; }
    if (lanternCount !== lastLanterns) { ui.lanterns.textContent = lanternCount; lastLanterns = lanternCount; }
    var h = new Array(lives + 1).join('♥') + new Array(Math.max(0, 3 - lives) + 1).join('♡');
    if (h !== lastHearts) { ui.hearts.textContent = h; lastHearts = h; }
  }

  // ---------- Screens ----------
  function show(el, on) { el.classList.toggle('hidden', !on); }
  function setState(s) {
    state = s;
    show(ui.menu, s === 'menu');
    show(ui.over, s === 'over');
    show(ui.pause, s === 'pause');
    show(ui.hud, s !== 'menu');
    show(ui.pauseBtn, s === 'play');
  }
  function start() {
    unlockAudio();
    reset();
    setState('play');
    sfx.start();
  }
  function pause() { if (state === 'play') setState('pause'); }
  function resume() { if (state === 'pause') setState('play'); }
  function gameOver() {
    var s = score();
    var isNew = s > best;
    if (isNew) { best = s; store.set('otterDusk.best', String(best)); }
    ui.finalScore.textContent = s;
    ui.finalBest.textContent = best;
    ui.finalLanterns.textContent = lanternCount;
    ui.best.textContent = best;
    show(ui.newBest, isNew);
    setState('over');
    sfx.over();
  }

  // ---------- Spawning ----------
  function isFree(x, y, d) {
    var i;
    for (i = 0; i < obstacles.length; i++) if (Math.hypot(obstacles[i].x - x, obstacles[i].y - y) < d + (obstacles[i].r || obstacles[i].len / 2)) return false;
    for (i = 0; i < pickups.length; i++) if (Math.hypot(pickups[i].x - x, pickups[i].y - y) < d) return false;
    return true;
  }
  function addObstacle(x, y) {
    var r = Math.random();
    if (r < 0.4) obstacles.push({ k: 'pyr', x: x, y: y, r: rand(20, 32) });
    else if (r < 0.8) obstacles.push({ k: 'boul', x: x, y: y, r: rand(20, 32) });
    else obstacles.push({ k: 'log', x: x, y: y, len: rand(64, 96), ang: rand(-0.35, 0.35) });
  }
  function spawnRow() {
    var minX = riverX0 + 62, maxX = riverX0 + riverW - 62, y = -80, placed = [];
    var two = Math.random() < Math.min(0.25 + t * 0.006, 0.6);
    var n = two ? 2 : 1, i, tries, x;
    for (i = 0; i < n; i++) {
      for (tries = 0; tries < 10; tries++) {
        x = rand(minX, maxX);
        var ok = true;
        for (var j = 0; j < placed.length; j++) if (Math.abs(placed[j] - x) < 140) ok = false;
        if (ok && isFree(x, y - i * 30, 40)) { placed.push(x); addObstacle(x, y - i * 30); break; }
      }
    }
    if (Math.random() < 0.65) {
      for (tries = 0; tries < 10; tries++) {
        x = rand(minX, maxX);
        var py = y - rand(60, 110);
        if (isFree(x, py, 60)) { pickups.push({ x: x, y: py, seed: rand(0, TAU) }); break; }
      }
    }
  }

  // ---------- Particles ----------
  function burst(x, y, color, n, power) {
    for (var i = 0; i < n; i++) {
      var a = rand(0, TAU), v = rand(0.3, 1) * power;
      particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.3, life: 0, max: rand(0.4, 0.8), r: rand(1.5, 3.5), c: color });
    }
  }
  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt;
    }
  }

  // ---------- Update ----------
  var keys = { left: false, right: false };

  function moveWorld(dt, spd) {
    scroll += spd * dt;
    var i, s;
    for (i = 0; i < streaks.length; i++) {
      s = streaks[i];
      s.y += spd * s.sp * dt;
      if (s.y > VH + 10) { s.y = -s.len - rand(0, 80); s.x = rand(-10, VW + 10); }
    }
    for (i = decor.length - 1; i >= 0; i--) {
      decor[i].y += spd * dt;
      if (decor[i].y > VH + 40) decor.splice(i, 1);
    }
    decorGap -= spd * dt;
    if (decorGap <= 0) { addDecor(-30); decorGap = rand(110, 260); }
  }

  function boatCircles() {
    return [{ x: boat.x, y: boat.y - 12, r: 8 }, { x: boat.x, y: boat.y + 8, r: 8 }];
  }
  function obstacleCircles(o) {
    if (o.k !== 'log') return [{ x: o.x, y: o.y + o.r * 0.1, r: o.r * 0.8 }];
    var out = [], c = Math.cos(o.ang), s = Math.sin(o.ang);
    for (var d = -o.len / 2 + 6; d <= o.len / 2 - 6 + 0.1; d += 12) out.push({ x: o.x + c * d, y: o.y + s * d, r: 8 });
    return out;
  }

  function hurt() {
    lives--;
    invuln = 1.4;
    shake = 0.35;
    sfx.hit();
    burst(boat.x, boat.y, '#ffffff', 18, 130);
    if (lives <= 0) { updateHud(); gameOver(); }
  }

  function update(dt) {
    if (shake > 0) shake = Math.max(0, shake - dt);
    updateParticles(dt);

    if (state === 'pause' || state === 'over') return;

    if (state === 'menu') {
      moveWorld(dt, 80);
      var now = performance.now();
      boat.x = (riverX0 * 2 + riverW) / 2 + Math.sin(now / 900) * 28;
      boat.vx = Math.cos(now / 900) * 28 / 0.9;
      return;
    }

    // --- playing ---
    t += dt;
    speed = Math.min(150 + t * 3.2, 330);
    dist += speed * dt;
    moveWorld(dt, speed);
    if (invuln > 0) invuln = Math.max(0, invuln - dt);

    // steering
    var dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    var prev = boat.x;
    if (dir) {
      boat.x += dir * 340 * dt;
      boat.x = clamp(boat.x, boatMin(), boatMax());
      boat.target = boat.x;
    } else {
      var step = (boat.target - boat.x) * Math.min(1, dt * 9);
      var maxStep = 520 * dt;
      boat.x += clamp(step, -maxStep, maxStep);
    }
    boat.x = clamp(boat.x, boatMin(), boatMax());
    boat.vx += ((boat.x - prev) / dt - boat.vx) * 0.3;

    // spawn
    spawnGap -= speed * dt;
    if (spawnGap <= 0) { spawnRow(); spawnGap = Math.max(150, speed * rand(0.85, 1.15)); }

    // move objects
    var i, j, o;
    for (i = obstacles.length - 1; i >= 0; i--) {
      o = obstacles[i]; o.y += speed * dt;
      if (o.y > VH + 100) obstacles.splice(i, 1);
    }
    for (i = pickups.length - 1; i >= 0; i--) {
      pickups[i].y += speed * dt;
      if (pickups[i].y > VH + 60) pickups.splice(i, 1);
    }

    // lantern pickup
    for (i = pickups.length - 1; i >= 0; i--) {
      if (Math.hypot(pickups[i].x - boat.x, pickups[i].y - boat.y) < 28) {
        burst(pickups[i].x, pickups[i].y, '#ffcf5a', 14, 110);
        pickups.splice(i, 1);
        lanternCount++;
        sfx.collect();
      }
    }

    // collisions
    if (invuln <= 0) {
      var bc = boatCircles(), hitSomething = false;
      for (i = 0; i < obstacles.length && !hitSomething; i++) {
        o = obstacles[i];
        if (Math.abs(o.y - boat.y) > 80) continue;
        var oc = obstacleCircles(o);
        for (j = 0; j < oc.length && !hitSomething; j++) {
          for (var k = 0; k < bc.length; k++) {
            if (Math.hypot(oc[j].x - bc[k].x, oc[j].y - bc[k].y) < oc[j].r + bc[k].r) { hitSomething = true; break; }
          }
        }
      }
      if (hitSomething) hurt();
    }

    // tiny paddle splashes
    if (Math.random() < dt * 14) particles.push({ x: boat.x + rand(-6, 6), y: boat.y + 20, vx: rand(-20, 20), vy: rand(20, 60), life: 0, max: 0.35, r: rand(1, 2), c: 'rgba(255,255,255,0.7)' });

    updateHud();
  }

  // ---------- Drawing helpers ----------
  function poly(pts, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  function ell(x, y, rx, ry, fill) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = fill; ctx.fill();
  }
  function hash(i, j) {
    var h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ---------- Drawing: world ----------
  function drawWater() {
    var g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#1b86a3');
    g.addColorStop(1, '#27c8c2');
    ctx.fillStyle = g;
    ctx.fillRect(-30, -30, VW + 60, VH + 60);
    var glow = ctx.createLinearGradient(0, 0, 0, VH * 0.55);
    glow.addColorStop(0, 'rgba(255,150,120,0.34)');
    glow.addColorStop(1, 'rgba(255,150,120,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-30, -30, VW + 60, VH * 0.55 + 30);

    ctx.strokeStyle = 'rgba(255,255,255,0.17)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < streaks.length; i++) {
      var s = streaks[i];
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + 2, s.y + s.len);
    }
    ctx.stroke();
  }

  function edgeW(side, y) {
    var w = y - scroll;
    return 38 + 9 * Math.sin(w * 0.013 + side * 2.1) + 6 * Math.sin(w * 0.041 + side * 4.3);
  }
  function bankPath(side, inset, close) {
    var p = new Path2D(), step = 28, y, x;
    var left = side === 0;
    var first = true;
    for (y = -step; y <= VH + step; y += step) {
      var e = edgeW(side, y) - inset;
      x = left ? riverX0 + e : riverX0 + riverW - e;
      if (first) { p.moveTo(x, y); first = false; } else p.lineTo(x, y);
    }
    if (close) {
      p.lineTo(left ? -60 : VW + 60, VH + step);
      p.lineTo(left ? -60 : VW + 60, -step);
      p.closePath();
    }
    return p;
  }
  var CLIFF = ['#6f5083', '#7b5a90', '#68497b', '#8964a0', '#735487'];
  function drawCliffFacets(side) {
    var cw = 74, ch = 84;
    var x0, x1;
    if (side === 0) { x0 = -60; x1 = riverX0 + 90; } else { x0 = riverX0 + riverW - 90; x1 = VW + 60; }
    var i0 = Math.floor(x0 / cw), i1 = Math.ceil(x1 / cw);
    var j0 = Math.floor((-ch - scroll) / ch), j1 = Math.floor((VH - scroll) / ch) + 1;
    for (var j = j0; j <= j1; j++) {
      var y0 = j * ch + scroll, y1 = y0 + ch;
      for (var i = i0; i <= i1; i++) {
        var xa = i * cw, xb = xa + cw;
        var c1 = CLIFF[Math.floor(hash(i, j) * CLIFF.length)];
        var c2 = CLIFF[Math.floor(hash(i + 91, j + 17) * CLIFF.length)];
        ctx.lineWidth = 1; ctx.lineJoin = 'round';
        ctx.fillStyle = c1; ctx.strokeStyle = c1;
        ctx.beginPath(); ctx.moveTo(xa, y0); ctx.lineTo(xb, y0); ctx.lineTo(xa, y1); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.strokeStyle = c2;
        ctx.beginPath(); ctx.moveTo(xb, y0); ctx.lineTo(xb, y1); ctx.lineTo(xa, y1); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
  }
  function drawBanks() {
    for (var side = 0; side < 2; side++) {
      // sand
      ctx.fillStyle = '#f1b98b';
      ctx.fill(bankPath(side, 0, true));
      // cliff (clipped faceted purple rock)
      ctx.save();
      ctx.clip(bankPath(side, 24, true));
      ctx.fillStyle = '#6f5083';
      ctx.fillRect(-60, -30, VW + 120, VH + 60);
      drawCliffFacets(side);
      ctx.restore();
      // foam line
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.stroke(bankPath(side, 0, false));
    }
  }

  function drawDecor(d) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(1, 0.72);
    ctx.rotate(d.rot);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, d.s, 0.35, TAU - 0.35);
    ctx.closePath();
    ctx.fillStyle = '#43b87d';
    ctx.fill();
    ctx.strokeStyle = '#2f9a68';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (d.flower) {
      ell(d.s * 0.15, -d.s * 0.05, d.s * 0.38, d.s * 0.38, '#ff9ec2');
      ell(d.s * 0.15, -d.s * 0.05, d.s * 0.18, d.s * 0.18, '#fff0f6');
    }
    ctx.restore();
  }

  function drawPickup(p) {
    var y = p.y + Math.sin(clock * 3 + p.seed) * 2.5;
    var g = ctx.createRadialGradient(p.x, y, 2, p.x, y, 32);
    g.addColorStop(0, 'rgba(255,210,100,0.7)');
    g.addColorStop(1, 'rgba(255,210,100,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, y, 32, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(p.x, y);
    ell(0, 13, 10, 3.5, 'rgba(255,255,255,0.35)');
    poly([[0, -11], [8, -5], [8, 6], [0, 11], [-8, 6], [-8, -5]], '#ffb42e', '#e2631a', 1.6);
    poly([[0, -6], [4, -3], [4, 3], [0, 6], [-4, 3], [-4, -3]], '#fff3b0');
    ctx.fillStyle = '#7b3f1d';
    ctx.fillRect(-3, -15, 6, 4);
    ctx.restore();
  }

  function drawRock(o) {
    var r = o.r;
    ctx.save();
    ctx.translate(o.x, o.y);
    ell(0, r * 0.5, r * 1.25, r * 0.5, 'rgba(255,255,255,0.28)');
    ell(r * 0.15, r * 0.6, r * 0.95, r * 0.3, 'rgba(10,60,80,0.22)');
    if (o.k === 'pyr') {
      var ap = [0, -r * 1.15], l = [-r * 0.95, r * 0.45], rr = [r * 0.95, r * 0.45], m = [0, r * 0.85];
      poly([ap, l, m], '#ecdbe4');
      poly([ap, m, rr], '#b996b6');
      poly([ap, l, m, rr], null, 'rgba(90,60,110,0.35)', 1);
    } else {
      poly([[-r, -r * 0.1], [-r * 0.5, -r * 0.7], [r * 0.6, -r * 0.65], [r, -r * 0.05], [r, r * 0.4], [r * 0.4, r * 0.7], [-r * 0.6, r * 0.7], [-r, r * 0.35]], '#a984ab');
      poly([[-r, -r * 0.1], [-r * 0.5, -r * 0.7], [r * 0.6, -r * 0.65], [r, -r * 0.05], [r * 0.4, r * 0.25], [-r * 0.6, r * 0.3]], '#efe0ea');
      poly([[r, -r * 0.05], [r * 0.4, r * 0.25], [r * 0.4, r * 0.7], [r, r * 0.4]], '#8e6c9d');
    }
    ctx.restore();
  }

  function drawLog(o) {
    var h = o.len / 2;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.ang);
    ell(0, 6, h + 8, 11, 'rgba(255,255,255,0.25)');
    poly([[-h, -8], [h, -8], [h + 4, 0], [h, 8], [-h, 8], [-h - 4, 0]], '#8f5d3d');
    poly([[-h, -8], [h, -8], [h + 4, 0], [-h - 4, 0]], '#b07a50');
    ell(h + 1, 0, 3.5, 7.5, '#d8aa78');
    ell(-h - 1, 0, 3.5, 7.5, '#d8aa78');
    ctx.strokeStyle = 'rgba(70,40,25,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-h * 0.4, -2); ctx.lineTo(-h * 0.1, -2); ctx.moveTo(h * 0.2, 3); ctx.lineTo(h * 0.6, 3); ctx.stroke();
    ctx.restore();
  }

  function drawBoat() {
    var x = boat.x, y = boat.y;
    var tilt = clamp(boat.vx * 0.0016, -0.35, 0.35);

    // wake
    ctx.save();
    var g = ctx.createLinearGradient(0, y + 14, 0, y + 130);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    var ks = [-6, -2.5, 2.5, 6];
    for (var i = 0; i < ks.length; i++) {
      ctx.beginPath();
      ctx.moveTo(x + ks[i] * 0.7, y + 14);
      ctx.lineTo(x + ks[i] * 3.2 - boat.vx * 0.06, y + 130);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    if (invuln > 0 && Math.floor(clock * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ell(2, 4, 13, 27, 'rgba(0,50,70,0.25)');
    // hull
    poly([[0, -27], [11, -9], [10, 15], [0, 25], [-10, 15], [-11, -9]], '#a06c46', '#cf9c66', 1.5);
    poly([[0, -27], [11, -9], [10, 15], [0, 25]], 'rgba(0,0,0,0.13)');
    poly([[0, -21], [7.5, -8], [6.8, 13], [0, 19], [-6.8, 13], [-7.5, -8]], '#5a3826');
    // paddle (right side)
    ctx.save();
    ctx.translate(7, 0);
    ctx.rotate(0.45 + Math.sin(clock * 7) * 0.18);
    ctx.strokeStyle = '#d0a273'; ctx.lineWidth = 1.9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 26); ctx.stroke();
    poly([[-2.6, 18], [2.6, 18], [3, 30], [-3, 30]], '#7a4a2b');
    ctx.restore();
    // otter
    ell(0, 3, 5.6, 7, '#3d7f8f');
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-5, 1); ctx.lineTo(5, 1); ctx.moveTo(-5.3, 4.5); ctx.lineTo(5.3, 4.5); ctx.stroke();
    ctx.strokeStyle = '#3d7f8f'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(3, 1); ctx.lineTo(8, -1); ctx.stroke();
    ell(0, -6, 5.6, 5.6, '#8a5530');
    ell(-4.6, -9.6, 2, 2, '#6d4223');
    ell(4.6, -9.6, 2, 2, '#6d4223');
    ell(0, -7.2, 3.3, 2.5, '#ebcca3');
    ell(0, -8.8, 1, 0.8, '#2b1a12');
    ell(-2.1, -5.6, 0.8, 0.8, '#2b1a12');
    ell(2.1, -5.6, 0.8, 0.8, '#2b1a12');
    ctx.restore();
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    var sx = 0, sy = 0;
    if (shake > 0) { sx = rand(-1, 1) * shake * 14; sy = rand(-1, 1) * shake * 14; }
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, sx * scale * dpr, sy * scale * dpr);
    ctx.globalAlpha = 1;
    drawWater();
    drawBanks();
    var i;
    for (i = 0; i < decor.length; i++) drawDecor(decor[i]);
    for (i = 0; i < pickups.length; i++) drawPickup(pickups[i]);
    var list = obstacles.slice().sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < list.length; i++) { if (list[i].k === 'log') drawLog(list[i]); else drawRock(list[i]); }
    drawBoat();
    drawParticles();
    // soft vignette so the edges feel like dusk
    var v = ctx.createLinearGradient(0, VH * 0.75, 0, VH);
    v.addColorStop(0, 'rgba(40,20,70,0)');
    v.addColorStop(1, 'rgba(40,20,70,0.22)');
    ctx.fillStyle = v;
    ctx.fillRect(-30, VH * 0.75, VW + 60, VH * 0.25 + 30);
  }

  // ---------- Input ----------
  function setTarget(clientX) {
    boat.target = clamp(clientX / scale, boatMin(), boatMax());
  }
  var pointerDown = false;
  window.addEventListener('pointerdown', function (e) {
    unlockAudio();
    if (state !== 'play') return;
    if (e.target && e.target.closest && e.target.closest('button')) return;
    pointerDown = true;
    setTarget(e.clientX);
  });
  window.addEventListener('pointermove', function (e) {
    if (state !== 'play') return;
    if (pointerDown || e.pointerType === 'mouse') setTarget(e.clientX);
  });
  function release() { pointerDown = false; }
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  window.addEventListener('keydown', function (e) {
    unlockAudio();
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.left = true; e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.right = true; e.preventDefault(); }
    else if (k === ' ' || k === 'Enter') {
      if (e.target && e.target.closest && e.target.closest('button')) return;
      if (state === 'menu' || state === 'over') { e.preventDefault(); start(); }
      else if (state === 'pause') { e.preventDefault(); resume(); }
    }
    else if (k === 'Escape' || k === 'p' || k === 'P') {
      if (state === 'play') pause(); else if (state === 'pause') resume();
    }
  });
  window.addEventListener('keyup', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
  });
  window.addEventListener('blur', function () { keys.left = keys.right = false; pause(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---------- Buttons ----------
  function click(id, fn) { $(id).addEventListener('click', function (e) { e.currentTarget.blur(); fn(); }); }
  click('playBtn', start);
  click('retryBtn', start);
  click('restartBtn', start);
  click('resumeBtn', resume);
  ui.pauseBtn.addEventListener('click', function (e) { e.currentTarget.blur(); pause(); });
  for (var si = 0; si < soundBtns.length; si++) {
    soundBtns[si].addEventListener('click', function (e) {
      e.currentTarget.blur();
      soundOn = !soundOn;
      store.set('otterDusk.sound', soundOn ? '1' : '0');
      refreshSoundBtns();
      unlockAudio();
      if (soundOn) sfx.collect();
    });
  }

  // ---------- Go ----------
  ui.best.textContent = best;
  refreshSoundBtns();
  resize();
  setState('menu');

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // tiny hook used only for automated testing
  window.__otter = { get state() { return state; }, get score() { return score(); }, get lives() { return lives; }, boat: boat, obstacles: function () { return obstacles; }, pickups: function () { return pickups; } };
})();
