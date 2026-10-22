/**
 * hud_presenter.js - Live Telemetry HUD, Localization & UI Presenter
 * Clean Architecture - Presentation Layer
 */

import { wrapAngle } from './flight_controller.js';
import { isSoundActive, initAudio } from './audio.js';

const TARGET_X = -62.0;
const GROUND_Z = 0.7;

/* =========================================================================
       3. DİL (I18N), VİDEO MODU VE CANLI TELEMETRİ GÜNCELLEMESİ (HTML HUD)
       =========================================================================
    */
    export let currentLang = 'tr';
    export let isVideoMode = false;

    export const I18N = {
      tr: {
        txt_status_title: "UÇUŞ DURUMU",
        txt_tele_title: "CANLI UÇUŞ TELEMETRİSİ",
        txt_act_title: "8 AKTÜATÖR: 4 ALT + 4 YAN RCS",
        lbl_alt: "İRTİFA (Z)",
        sub_alt: "Hedef: 0.7m",
        lbl_xerr: "HEDEF HATASI (ΔX)",
        sub_xerr: "Pist: X = -62m",
        lbl_vz: "DİKEY HIZ (VZ)",
        sub_vz: "İniş: ≤ 1.5 m/s",
        lbl_vx: "YATAY HIZ (VX)",
        sub_vx: "İniş: ≤ 2.5 m/s",
        lbl_pitch: "PITCH EĞİMİ (θ)",
        sub_pitch: "İniş: ≤ 8.0°",
        lbl_roll: "ROLL BURGU (φ)",
        sub_roll: "360° Burgu",
        lbl_omega: "PITCH HIZI (ω)",
        sub_omega: "Açısal Hız",
        lbl_omega_roll: "ROLL HIZI (ω_r)",
        sub_omega_roll: "RCS Torku",
        lbl_act_t1: "ALT ÖN-SOL",
        lbl_act_t2: "ALT ÖN-SAĞ",
        lbl_act_t3: "ALT ARKA-SOL",
        lbl_act_t4: "ALT ARKA-SAĞ",
        lbl_act_rcs1: "RCS SOL-ÖN",
        lbl_act_rcs2: "RCS SOL-ARKA",
        lbl_act_rcs3: "RCS SAĞ-ÖN",
        lbl_act_rcs4: "RCS SAĞ-ARKA",
        btn_tab_journey: "0-1M EĞİTİM YOLCULUĞU",
        btn_tab_arena: "CANLI 120Hz ARENA",
        cam_hint_pill: "Fare: Çevir / Kaydır / Zoom",
        btn_reset_cam: "Kamerayı Sıfırla",
        btn_arena_launch: "RAMPADAN FIRLAT",
        btn_arena_drop: "TERS BIRAK",
        btn_arena_fling: "KAOTİK FIRLAT",
        btn_arena_wind: "YAN RÜZGAR",
        chip_0: "0 Adım (Takla)",
        chip_20000: "20k (Toparlama)",
        chip_100000: "100k (Frenleme)",
        chip_300000: "300k (Alçalma)",
        chip_1000000: "1M (Yumuşak İniş)",
        rec_label: "VİDEO KAYDET",
        btn_play_pause: "DURAKLAT",
        btn_video_mode: "VİDEO MODU (SEKMELERİ GİZLE)",
        btn_video_mode_on: "VİDEO MODU: AKTİF (SEKMELER GİZLİ)",
        toast_video_on: "Video Modu: Tam ekran temiz görünüm aktif (Menü için ☰)",
        toast_video_off: "Video Modu: Standart arayüz aktif",
        toast_lang_tr: "Dil: Türkçe aktif",
        toast_lang_en: "Language: English active",
        txt_menu_label: "MENÜ",
        txt_drawer_title: "KONTROL PANELİ",
        txt_d_mode: "MOD SEÇİMİ",
        txt_d_view: "GÖRÜNÜM AYARLARI",
        txt_d_exit_video: "VİDEO MODUNDAN ÇIK",
        txt_d_lang: "DİL: EN",
        txt_d_actions: "ARENA AKSİYONLARI",
        txt_d_checkpoints: "EĞİTİM ADIMLARI",
        txt_d_playback: "OYNATMA & KAYIT",
        txt_d_hud_toggle: "TELEMETRİ PANELİ",
        d_btn_toggle_tele: "SOL TELEMETRİYİ GÖSTER / GİZLE"
      },
      en: {
        txt_status_title: "FLIGHT STATUS",
        txt_tele_title: "LIVE FLIGHT TELEMETRY",
        txt_act_title: "8 ACTUATORS: 4 MAIN + 4 RCS",
        lbl_alt: "ALTITUDE (Z)",
        sub_alt: "Target: 0.7m",
        lbl_xerr: "TARGET OFFSET (ΔX)",
        sub_xerr: "Runway: X = -62m",
        lbl_vz: "VERTICAL SPEED (VZ)",
        sub_vz: "Landing: ≤ 1.5 m/s",
        lbl_vx: "HORIZONTAL SPEED (VX)",
        sub_vx: "Landing: ≤ 2.5 m/s",
        lbl_pitch: "PITCH ANGLE (θ)",
        sub_pitch: "Landing: ≤ 8.0°",
        lbl_roll: "ROLL ANGLE (φ)",
        sub_roll: "360° Axial Roll",
        lbl_omega: "PITCH RATE (ω)",
        sub_omega: "Angular Rate",
        lbl_omega_roll: "ROLL RATE (ω_r)",
        sub_omega_roll: "RCS Torque",
        lbl_act_t1: "MAIN FRONT-LEFT",
        lbl_act_t2: "MAIN FRONT-RIGHT",
        lbl_act_t3: "MAIN REAR-LEFT",
        lbl_act_t4: "MAIN REAR-RIGHT",
        lbl_act_rcs1: "RCS LEFT-FRONT",
        lbl_act_rcs2: "RCS LEFT-REAR",
        lbl_act_rcs3: "RCS RIGHT-FRONT",
        lbl_act_rcs4: "RCS RIGHT-REAR",
        btn_tab_journey: "0-1M TRAINING ROADMAP",
        btn_tab_arena: "LIVE 120Hz ARENA",
        cam_hint_pill: "Mouse: Rotate / Pan / Zoom",
        btn_reset_cam: "Reset Camera",
        btn_arena_launch: "RAMP LAUNCH",
        btn_arena_drop: "INVERTED DROP",
        btn_arena_fling: "CHAOTIC FLING",
        btn_arena_wind: "CROSSWIND",
        chip_0: "0 Steps (Tumble)",
        chip_20000: "20k (Recovery)",
        chip_100000: "100k (Braking)",
        chip_300000: "300k (Descent)",
        chip_1000000: "1M (Soft Landing)",
        rec_label: "RECORD VIDEO",
        btn_play_pause: "PAUSE",
        btn_video_mode: "VIDEO MODE (HIDE TABS)",
        btn_video_mode_on: "VIDEO MODE: ACTIVE (TABS HIDDEN)",
        toast_video_on: "Video Mode: Clean full screen active (Use ☰ Menu)",
        toast_video_off: "Video Mode: Standard view active",
        toast_lang_tr: "Dil: Türkçe aktif",
        toast_lang_en: "Language: English active",
        txt_menu_label: "MENU",
        txt_drawer_title: "CONTROL PANEL",
        txt_d_mode: "MODE SELECTION",
        txt_d_view: "VIEW SETTINGS",
        txt_d_exit_video: "EXIT VIDEO MODE",
        txt_d_lang: "LANGUAGE: TR",
        txt_d_actions: "ARENA ACTIONS",
        txt_d_checkpoints: "TRAINING MILESTONES",
        txt_d_playback: "PLAYBACK & RECORD",
        txt_d_hud_toggle: "TELEMETRY PANEL",
        d_btn_toggle_tele: "SHOW / HIDE TELEMETRY"
      }
    };

    let isHamburgerOpen = false;
    let isVideoHUDVisible = false;

    export function toggleHamburgerMenu(forceState) {
      initAudio();
      if (typeof forceState === 'boolean') {
        isHamburgerOpen = forceState;
      } else {
        isHamburgerOpen = !isHamburgerOpen;
      }
      const drawer = document.getElementById('video-drawer');
      const backdrop = document.getElementById('drawer-backdrop');
      if (drawer) drawer.classList.toggle('open', isHamburgerOpen);
      if (backdrop) backdrop.classList.toggle('open', isHamburgerOpen);
    }

    export function toggleVideoHUD() {
      initAudio();
      isVideoHUDVisible = !isVideoHUDVisible;
      document.body.classList.toggle('show-hud', isVideoHUDVisible);
      const btn = document.getElementById('d-btn-toggle-tele');
      if (btn) {
        btn.innerText = isVideoHUDVisible ?
          (currentLang === 'tr' ? 'TELEMETRİYİ GİZLE' : 'HIDE TELEMETRY') :
          (currentLang === 'tr' ? 'TELEMETRİYİ GÖSTER' : 'SHOW TELEMETRY');
      }
      showToast(isVideoHUDVisible ?
        (currentLang === 'tr' ? 'Telemetri Paneli Gösteriliyor' : 'Telemetry Panel Visible') :
        (currentLang === 'tr' ? 'Telemetri Paneli Gizlendi' : 'Telemetry Panel Hidden'));
    }

    export function applyLanguage(lang) {
      currentLang = lang;
      const dict = I18N[lang];
      for (const [id, val] of Object.entries(dict)) {
        const el = document.getElementById(id.replace(/_/g, '-'));
        if (el) el.innerText = val;
      }
      const langBtn = document.getElementById('btn-lang-toggle');
      if (langBtn) langBtn.innerText = (lang === 'tr') ? 'EN' : 'TR';
      const dLangBtn = document.getElementById('txt-d-lang');
      if (dLangBtn) dLangBtn.innerText = (lang === 'tr') ? 'DİL: EN' : 'LANGUAGE: TR';
      const soundBtn = document.getElementById('btn-sound');
      if (soundBtn) soundBtn.innerText = isSoundActive() ? (lang === 'tr' ? 'SES: AÇIK' : 'SOUND: ON') : (lang === 'tr' ? 'SES: KAPALI' : 'SOUND: OFF');
      const dSoundBtn = document.getElementById('d-btn-sound');
      if (dSoundBtn) dSoundBtn.innerText = isSoundActive() ? (lang === 'tr' ? 'SES: AÇIK' : 'SOUND: ON') : (lang === 'tr' ? 'SES: KAPALI' : 'SOUND: OFF');
      const vBtn = document.getElementById('btn-video-mode');
      if (vBtn) vBtn.innerText = isVideoMode ? (lang === 'tr' ? I18N.tr.btn_video_mode_on : I18N.en.btn_video_mode_on) : (lang === 'tr' ? I18N.tr.btn_video_mode : I18N.en.btn_video_mode);
      const playBtn = document.getElementById('btn-play');
      const playingState = (typeof window.isPlaying !== 'undefined') ? window.isPlaying : true;
      if (playBtn) playBtn.innerText = playingState ? (lang === 'tr' ? 'DURAKLAT' : 'PAUSE') : (lang === 'tr' ? 'OYNAT' : 'PLAY');
      const dPlayBtn = document.getElementById('d-btn-play');
      if (dPlayBtn) dPlayBtn.innerText = playingState ? (lang === 'tr' ? 'DURAKLAT' : 'PAUSE') : (lang === 'tr' ? 'OYNAT' : 'PLAY');
    }

    export function toggleLanguage() {
      initAudio();
      applyLanguage(currentLang === 'tr' ? 'en' : 'tr');
      showToast(currentLang === 'tr' ? I18N.tr.toast_lang_tr : I18N.en.toast_lang_en);
    }

    export function toggleVideoMode() {
      initAudio();
      isVideoMode = !isVideoMode;
      document.body.classList.toggle('video-mode', isVideoMode);
      if (!isVideoMode) {
        toggleHamburgerMenu(false);
        document.body.classList.remove('show-hud');
        isVideoHUDVisible = false;
      }
      const btn = document.getElementById('btn-video-mode');
      if (btn) {
        btn.classList.toggle('active-toggle', isVideoMode);
        btn.innerText = isVideoMode ? (currentLang === 'tr' ? I18N.tr.btn_video_mode_on : I18N.en.btn_video_mode_on) : (currentLang === 'tr' ? I18N.tr.btn_video_mode : I18N.en.btn_video_mode);
      }
      showToast(isVideoMode ? (currentLang === 'tr' ? I18N.tr.toast_video_on : I18N.en.toast_video_on) : (currentLang === 'tr' ? I18N.tr.toast_video_off : I18N.en.toast_video_off));
    }

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === '1' || e.code === 'Digit1' || e.code === 'Numpad1') {
        if (window.switchAppMode && window.currentMode !== 'arena') window.switchAppMode('arena');
        if (window.arenaLaunchRamp) window.arenaLaunchRamp();
        if (window.gsap) gsap.fromTo('#btn-arena-launch', { scale: 0.92 }, { scale: 1.0, duration: 0.2, ease: 'back.out(2)' });
      } else if (e.key === '2' || e.code === 'Digit2' || e.code === 'Numpad2') {
        if (window.switchAppMode && window.currentMode !== 'arena') window.switchAppMode('arena');
        if (window.arenaDropHigh) window.arenaDropHigh();
        if (window.gsap) gsap.fromTo('#btn-arena-drop', { scale: 0.92 }, { scale: 1.0, duration: 0.2, ease: 'back.out(2)' });
      } else if (e.key === '3' || e.code === 'Digit3' || e.code === 'Numpad3') {
        if (window.switchAppMode && window.currentMode !== 'arena') window.switchAppMode('arena');
        if (window.arenaRandomFling) window.arenaRandomFling();
        if (window.gsap) gsap.fromTo('#btn-arena-fling', { scale: 0.92 }, { scale: 1.0, duration: 0.2, ease: 'back.out(2)' });
      } else if (e.key === '4' || e.code === 'Digit4' || e.code === 'Numpad4') {
        if (window.switchAppMode && window.currentMode !== 'arena') window.switchAppMode('arena');
        if (window.arenaTriggerWind) window.arenaTriggerWind();
        if (window.gsap) gsap.fromTo('#btn-arena-wind', { scale: 0.92 }, { scale: 1.0, duration: 0.2, ease: 'back.out(2)' });
      } else if (e.key === 'v' || e.key === 'V') {
        toggleVideoMode();
      } else if (e.key === 'm' || e.key === 'M') {
        if (isVideoMode) toggleHamburgerMenu();
      } else if (e.key === 'Escape') {
        if (isHamburgerOpen) toggleHamburgerMenu(false);
      } else if (e.key === 'l' || e.key === 'L') {
        toggleLanguage();
      } else if (e.key === 'r' || e.key === 'R') {
        if (window.switchAppMode && window.currentMode !== 'arena') window.switchAppMode('arena');
        if (window.arenaLaunchRamp) window.arenaLaunchRamp();
      }
    });

    export function getI18nTitle(title) {
      const isEn = (currentLang === 'en');
      if (!title) return isEn ? 'IN FLIGHT' : 'UÇUŞTA';
      const t = title.toLowerCase();
      if (t === 'soft landing') return isEn ? 'SOFT LANDING' : 'YUMUŞAK İNİŞ';
      if (t.includes('crash') || t.includes('flips')) return isEn ? 'CRASH' : 'KAZA';
      if (t.includes('ramp')) return isEn ? 'RAMP LAUNCH' : 'RAMPA FIRLATMA';
      return isEn ? 'IN FLIGHT' : 'UÇUŞTA';
    }

    // GSAP Destekli Pürüzsüz Telemetri Akışı & Sayı Odometresi
    const teleSmooth = {
      alt: 0.0,
      xerr: 0.0,
      vz: 0.0,
      vx: 0.0,
      pitch: 0.0,
      roll: 0.0,
      omega: 0.0,
      omegaRoll: 0.0,
      gforce: 1.0,
      fuel: 45.0
    };

    export function updateHTMLHUD(step, title, stateData) {
      const badge = document.getElementById('hud-stage-badge');
      const dot = document.getElementById('hud-status-dot');
      if (badge) {
        badge.className = 'stage-badge';
        const displayTitle = getI18nTitle(title);
        if (badge.innerText !== displayTitle) {
          badge.innerText = displayTitle;
          if (window.gsap) {
            gsap.fromTo(badge, { scale: 0.92, filter: 'brightness(1.6)' }, { scale: 1.0, filter: 'brightness(1.0)', duration: 0.32, ease: 'back.out(2)' });
          }
        }
        if (title === 'soft landing') {
          badge.classList.add('soft');
          if (dot) { dot.style.background = '#00ff66'; dot.style.boxShadow = '0 0 14px #00ff66'; }
        } else if (title === 'lands hard') {
          badge.classList.add('hard');
          if (dot) { dot.style.background = '#fbbf24'; dot.style.boxShadow = '0 0 14px #fbbf24'; }
        } else if (title === 'flips but crashes' || title.includes('crash')) {
          badge.classList.add('flip');
          if (dot) { dot.style.background = '#ef4444'; dot.style.boxShadow = '0 0 14px #ef4444'; }
        } else {
          badge.classList.add('pure-ai');
          if (dot) { dot.style.background = '#00ff66'; dot.style.boxShadow = '0 0 14px #00ff66'; }
        }
      }

      if (!stateData) return;

      const targetAlt = Math.max(0.0, stateData.z - GROUND_Z);
      const targetXerr = Math.abs(stateData.x - TARGET_X);
      const targetVz = stateData.vz;
      const targetVx = stateData.vx;

      const headingBase = Math.cos(stateData.theta) >= 0 ? 0.0 : Math.PI;
      const targetPitch = wrapAngle(stateData.theta - headingBase) * 180.0 / Math.PI;
      const curRoll = (stateData.roll !== undefined) ? stateData.roll : ((stateData.roll_deg || 0.0) * Math.PI / 180.0);
      const targetRoll = wrapAngle(curRoll - headingBase) * 180.0 / Math.PI;
      const targetOmega = stateData.omega || 0.0;
      const targetOmegaRoll = stateData.omega_roll || stateData.omegaRoll || 0.0;
      const targetGforce = (stateData.gForce !== undefined) ? stateData.gForce : (stateData.gforce || 1.0);
      const targetFuel = (stateData.fuel_mass !== undefined) ? stateData.fuel_mass : ((stateData.fuelMass !== undefined) ? stateData.fuelMass : 45.0);

      // Hızlı ve Akıcı Sayı Akışı (Exponential Smoothing Odometer)
      const k = 0.28;
      teleSmooth.alt += (targetAlt - teleSmooth.alt) * k;
      teleSmooth.xerr += (targetXerr - teleSmooth.xerr) * k;
      teleSmooth.vz += (targetVz - teleSmooth.vz) * k;
      teleSmooth.vx += (targetVx - teleSmooth.vx) * k;
      teleSmooth.pitch += (targetPitch - teleSmooth.pitch) * k;
      teleSmooth.roll += (targetRoll - teleSmooth.roll) * k;
      teleSmooth.omega += (targetOmega - teleSmooth.omega) * k;
      teleSmooth.omegaRoll += (targetOmegaRoll - teleSmooth.omegaRoll) * k;
      teleSmooth.gforce += (targetGforce - teleSmooth.gforce) * k;
      teleSmooth.fuel += (targetFuel - teleSmooth.fuel) * k;

      const elAlt = document.getElementById('hud-alt');
      const elXerr = document.getElementById('hud-xerr');
      const elVz = document.getElementById('hud-vz');
      const elVx = document.getElementById('hud-vx');
      const elPitch = document.getElementById('hud-pitch');
      const elRoll = document.getElementById('hud-roll');
      const elOmega = document.getElementById('hud-omega');
      const elOmegaRoll = document.getElementById('hud-omega-roll');
      const elGforce = document.getElementById('hud-gforce');
      const elSubG = document.getElementById('sub-gforce');
      const elFuel = document.getElementById('hud-fuel');
      const elFuelBar = document.getElementById('hud-fuel-bar');

      if (elAlt) elAlt.innerText = `${teleSmooth.alt.toFixed(1)} m`;
      if (elXerr) elXerr.innerText = `${teleSmooth.xerr.toFixed(1)} m`;
      if (elVz) elVz.innerText = `${teleSmooth.vz.toFixed(1)} m/s`;
      if (elVx) elVx.innerText = `${teleSmooth.vx.toFixed(1)} m/s`;
      if (elPitch) elPitch.innerText = `${teleSmooth.pitch.toFixed(1)}°`;
      if (elRoll) elRoll.innerText = `${teleSmooth.roll.toFixed(1)}°`;
      if (elOmega) elOmega.innerText = `${teleSmooth.omega.toFixed(2)} rad/s`;
      if (elOmegaRoll) elOmegaRoll.innerText = `${teleSmooth.omegaRoll.toFixed(2)} rad/s`;
      if (elGforce) elGforce.innerText = `${teleSmooth.gforce.toFixed(2)} G`;
      if (elSubG) elSubG.innerText = `Pik: ${(stateData.maxGForce || teleSmooth.gforce).toFixed(1)}G`;
      if (elFuel) {
        const fuelPct = Math.max(0, Math.min(100, Math.round((teleSmooth.fuel / 45.0) * 100)));
        elFuel.innerText = `${teleSmooth.fuel.toFixed(1)} kg (${fuelPct}%)`;
        if (elFuelBar) elFuelBar.style.width = `${fuelPct}%`;
      }

      const tPcts = stateData.thruster_pcts || [0, 0, 0, 0];
      const rPcts = stateData.rcs_pcts || [0, 0, 0, 0];
      setActuatorBar('hud-t1', tPcts[0]);
      setActuatorBar('hud-t2', tPcts[1]);
      setActuatorBar('hud-t3', tPcts[2]);
      setActuatorBar('hud-t4', tPcts[3]);
      setActuatorBar('hud-rcs1', Math.abs(rPcts[0]));
      setActuatorBar('hud-rcs2', Math.abs(rPcts[1]));
      setActuatorBar('hud-rcs3', Math.abs(rPcts[2]));
      setActuatorBar('hud-rcs4', Math.abs(rPcts[3]));

    }

    export function setActuatorBar(id, val) {
      const num = Number(val);
      const safeVal = (isNaN(num) || num === null || num === undefined) ? 0.0 : num;
      const clamped = Math.min(1.0, Math.max(0.0, safeVal));
      const p = Math.round(clamped * 100);
      const b = document.getElementById(`${id}-bar`);
      const txt = document.getElementById(`${id}-pct`);
      if (b) b.style.width = `${p}%`;
      if (txt) txt.innerText = `${p}%`;
    }

    
export function showToast(msg) {
  // Ekranda kayan bildirim yazıları kaldırıldı
  return;
}
