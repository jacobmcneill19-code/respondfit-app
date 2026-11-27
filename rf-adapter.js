/* RespondFit standalone adapter.
   Gives the app sign-in, a membership check and cloud storage using Firebase,
   in place of the hooks the Claude platform used to provide. */
(function () {
  'use strict';
  var C = window.RF_CONFIG || {}, LINKS = window.RF_STRIPE || {};
  var configured = !!(C.apiKey && C.projectId && !/PASTE|YOUR_/i.test(C.apiKey + C.projectId));
  var VER = '10.12.2', BASE = 'https://www.gstatic.com/firebasejs/' + VER + '/';
  var ST = { uid: null, user: null, admin: false, paid: false, auth: null, db: null, stg: null };
  var FB = null, okRes, ready = new Promise(function (r) { okRes = r; }), caps = {}, resolved = false, KEY = 'momentum-v1';

  window.BU = function (id) {
    return 'https://firebasestorage.googleapis.com/v0/b/' + encodeURIComponent(C.storageBucket || '') + '/o/blobs%2F' + encodeURIComponent(id) + '?alt=media';
  };
  window.claude = {
    use: function (n) {
      if (!configured) return Promise.resolve(null);
      return ready.then(function () { return caps[n] ? caps[n]() : null; });
    }
  };
  window.RFA = {
    signOut: function () {
      var done = function () { location.reload(); };
      try { FB.auth.signOut(ST.auth).then(done, done); } catch (e) { done(); }
    },
    push: {
      info: function () {
        if (window.RFNATIVE) { var ntk = ''; try { ntk = localStorage.getItem('rf_push_' + (ST.uid || '')) || ''; } catch (e) {} var npm = window.RFNATIVE.permission || 'default'; return { supported: true, ios: false, standalone: true, needsInstall: false, permission: npm, on: npm === 'granted' ? ntk : '' }; }
        var ua = navigator.userAgent, ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        var sa = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
        var sup = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window, tok = '';
        try { tok = localStorage.getItem('rf_push_' + (ST.uid || '')) || ''; } catch (e) {}
        var perm = sup ? Notification.permission : 'unsupported';
        return { supported: sup, ios: ios, standalone: sa, needsInstall: sup && ios && !sa, permission: perm, on: perm === 'granted' ? tok : '' };
      },
      enable: function () {
        if (window.RFNATIVE) return window.RFNATIVE.enable().then(function (tok) { return FB.fs.setDoc(FB.fs.doc(ST.db, 'pushTokens', tok), { uid: ST.uid, ua: 'RespondFit-Android', t: Date.now() }).then(function () { try { localStorage.setItem('rf_push_' + ST.uid, tok); } catch (e) {} return tok; }); });
        if (!C.vapidKey) return Promise.reject(new Error('novapid'));
        return Notification.requestPermission().then(function (p) {
          if (p !== 'granted') throw new Error('denied');
          return Promise.all([import(BASE + 'firebase-messaging.js'), navigator.serviceWorker.ready]);
        }).then(function (r) {
          return r[0].getToken(r[0].getMessaging(ST.fapp), { vapidKey: C.vapidKey, serviceWorkerRegistration: r[1] });
        }).then(function (tok) {
          if (!tok) throw new Error('notoken');
          return FB.fs.setDoc(FB.fs.doc(ST.db, 'pushTokens', tok), { uid: ST.uid, ua: navigator.userAgent.slice(0, 120), t: Date.now() }).then(function () {
            try { localStorage.setItem('rf_push_' + ST.uid, tok); } catch (e) {}
            return tok;
          });
        });
      },
      setPrefs: function (tok, prefs) {
        if (!tok || !ST.uid) return Promise.resolve();
        var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
        return FB.fs.setDoc(FB.fs.doc(ST.db, 'pushTokens', tok), { uid: ST.uid, ua: window.RFNATIVE ? 'RespondFit-Android' : navigator.userAgent.slice(0, 120), t: Date.now(), prefs: Object.assign({ tz: tz }, prefs) }, { merge: true });
      },
      setState: function (o) {
        if (!ST.uid) return Promise.resolve();
        return FB.fs.setDoc(FB.fs.doc(ST.db, 'pushState', ST.uid), { d: String(o.d || '').slice(0, 10), B: !!o.B, L: !!o.L, D: !!o.D, t: Date.now() });
      },
      rest: function (end) {
        if (!ST.uid || !end) return Promise.resolve();
        return FB.fs.setDoc(FB.fs.doc(ST.db, 'pushRest', ST.uid), { end: Math.round(+end), t: Date.now() }).catch(function () {});
      },
      restClear: function () {
        if (!ST.uid) return Promise.resolve();
        return FB.fs.deleteDoc(FB.fs.doc(ST.db, 'pushRest', ST.uid)).catch(function () {});
      },
      queue: function (o) {
        if (!ST.uid) return Promise.reject(new Error('signin'));
        return FB.fs.addDoc(FB.fs.collection(ST.db, 'pushQueue'), { title: String(o.title || '').slice(0, 60), body: String(o.body || '').slice(0, 160), to: o.to === 'all' ? 'all' : 'uid:' + ST.uid, by: ST.uid, t: Date.now() });
      },
      disable: function () {
        var tok = '';
        try { tok = localStorage.getItem('rf_push_' + ST.uid) || ''; localStorage.removeItem('rf_push_' + ST.uid); } catch (e) {}
        var p = tok ? FB.fs.deleteDoc(FB.fs.doc(ST.db, 'pushTokens', tok)).catch(function () {}) : Promise.resolve();
        p = p.then(function () { return FB.fs.deleteDoc(FB.fs.doc(ST.db, 'pushState', ST.uid)).catch(function () {}); });
        p = p.then(function () { return FB.fs.deleteDoc(FB.fs.doc(ST.db, 'pushRest', ST.uid)).catch(function () {}); });
        if (window.RFNATIVE) return p.then(function () { return window.RFNATIVE.disable(); }).catch(function () {});
        return p.then(function () { return import(BASE + 'firebase-messaging.js'); }).then(function (M) { return M.deleteToken(M.getMessaging(ST.fapp)); }).catch(function () {});
      }
    },
    email: function () { return ST.user ? (ST.user.email || '') : ''; }, consent: function () { return ST.consent || null; }
  };

  /* ---------- Firestore does not allow arrays inside arrays; wrap them ---------- */
  function enc(v, inArr) {
    if (Array.isArray(v)) { var m = v.map(function (x) { return enc(x, true); }); return inArr ? { __a: m } : m; }
    if (v && typeof v === 'object' && !(v instanceof Date)) { var o = {}; for (var k in v) o[k] = enc(v[k], false); return o; }
    return v;
  }
  function dec(v) {
    if (Array.isArray(v)) return v.map(dec);
    if (v && typeof v === 'object') {
      var ks = Object.keys(v);
      if (ks.length === 1 && ks[0] === '__a' && Array.isArray(v.__a)) return v.__a.map(dec);
      var o = {}; ks.forEach(function (k) { o[k] = dec(v[k]); }); return o;
    }
    return v;
  }

  /* ---------- database wrapper ---------- */
  function wrapSnap(s) { return { id: s.id, exists: s.exists(), data: function () { var d = s.data(); return d ? dec(d) : d; } }; }
  function wrapQ(q) {
    var docs = q.docs.map(wrapSnap);
    return { docs: docs, size: q.size, empty: q.empty, forEach: function (f) { docs.forEach(f); } };
  }
  function Ref(path) {
    var fs = FB.fs, ref = fs.doc(ST.db, path);
    return {
      id: ref.id, path: path,
      get: function () { return fs.getDoc(ref).then(wrapSnap); },
      set: function (d) { return fs.setDoc(ref, enc(d)); },
      update: function (d) { return fs.updateDoc(ref, enc(d)); },
      delete: function () { return fs.deleteDoc(ref); },
      onSnapshot: function (a, b) { return fs.onSnapshot(ref, function (s) { a(wrapSnap(s)); }, function (e) { if (b) b(e); }); },
      collection: function (p) { return Col(path + '/' + p); }
    };
  }
  function Col(path, cons) {
    cons = cons || [];
    var fs = FB.fs;
    function q() { return fs.query.apply(null, [fs.collection(ST.db, path)].concat(cons)); }
    return {
      doc: function (id) { return Ref(path + '/' + id); },
      add: function (d) { return fs.addDoc(fs.collection(ST.db, path), enc(d)).then(function (r) { return Ref(path + '/' + r.id); }); },
      limit: function (n) { return Col(path, cons.concat([fs.limit(n)])); },
      orderBy: function (f, d) { return Col(path, cons.concat([fs.orderBy(f, d || 'asc')])); },
      where: function (f, op, v) { return Col(path, cons.concat([fs.where(f, op, v)])); },
      get: function () { return fs.getDocs(q()).then(wrapQ); },
      onSnapshot: function (a, b) { return fs.onSnapshot(q(), function (s) { a(wrapQ(s)); }, function (e) { if (b) b(e); }); }
    };
  }

  /* ---------- capabilities the app asks for ---------- */
  var nameCache = {};
  caps.db = function () { return Promise.resolve({ doc: function (p) { return Ref(p); }, collection: function (p) { return Col(p); } }); };
  caps.user = function () {
    return Promise.resolve({
      isOwner: function () { return ST.admin; },
      canEdit: function () { return ST.admin; },
      can: function () { return ST.paid; },
      id: function () { return Promise.resolve(ST.uid); },
      me: function () { return Promise.resolve({ id: ST.uid, name: ST.user.displayName || '', email: ST.user.email || '' }); },
      profiles: function (ids) {
        var out = {};
        return Promise.all((ids || []).map(function (id) {
          if (nameCache[id] != null) { out[id] = { id: id, name: nameCache[id] }; return; }
          return FB.fs.getDoc(FB.fs.doc(ST.db, 'profiles', id)).then(function (s) {
            var n = s.exists() ? String((s.data() || {}).name || '') : '';
            nameCache[id] = n; out[id] = { id: id, name: n };
          }, function () { out[id] = { id: id, name: '' }; });
        })).then(function () { return out; });
      }
    });
  };
  function rand() { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  caps.assets = function () {
    return Promise.resolve({
      upload: function (blob) {
        var id = rand(), r = FB.st.ref(ST.stg, 'blobs/' + id);
        return FB.st.uploadBytes(r, blob, { contentType: blob.type || 'application/octet-stream', customMetadata: { uid: ST.uid } })
          .then(function () { return { id: id, url: window.BU(id), sizeBytes: blob.size, contentType: blob.type }; });
      },
      list: function () { return Promise.resolve({ assets: [], usage: {} }); },
      delete: function (id) { return FB.st.deleteObject(FB.st.ref(ST.stg, 'blobs/' + id)); }
    });
  };
  caps.downloads = function () {
    return Promise.resolve({
      save: function (o) {
        var b = o.data instanceof Blob ? o.data : new Blob([o.data]), u = URL.createObjectURL(b), a = document.createElement('a');
        a.href = u; a.download = o.filename || 'download'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 4000); return Promise.resolve();
      }
    });
  };
  /* ---------- Fit bot / AI plans: Gemini through Firebase AI Logic. The API key stays on Google's servers. Off unless RF_AI.on is true. ---------- */
  var AIV = '12.4.0', AIBASE = 'https://www.gstatic.com/firebasejs/' + AIV + '/', aiMod = null;
  function aiErr(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function aiLoad(A) {
    if (aiMod) return aiMod;
    aiMod = Promise.all([import(AIBASE + 'firebase-app.js'), import(AIBASE + 'firebase-ai.js')]).then(function (m) {
      var app; try { app = m[0].getApp('rf-ai'); } catch (e) { app = m[0].initializeApp(C, 'rf-ai'); }
      var go = A.appCheckKey ? import(AIBASE + 'firebase-app-check.js').then(function (c) { c.initializeAppCheck(app, { provider: new c.ReCaptchaEnterpriseProvider(A.appCheckKey), isTokenAutoRefreshEnabled: true }); }) : Promise.resolve();
      return go.then(function () { return { b: m[1], ai: m[1].getAI(app, { backend: new m[1].GoogleAIBackend() }) }; });
    });
    aiMod.catch(function () { aiMod = null; });
    return aiMod;
  }
  function aiCount(kind, cap, add) {
    var k = 'rf_ai_' + kind + '_' + (ST.uid || '') + '_' + new Date().toISOString().slice(0, 10), n = 0;
    try { n = +localStorage.getItem(k) || 0; if (add) localStorage.setItem(k, String(n + 1)); } catch (e) {}
    return n >= cap;
  }
  caps.sample = function () {
    var A = window.RF_AI || {};
    if (!A.on || !ST.uid || !C.projectId) return Promise.resolve(null);
    function run(input, opts, json) {
      opts = opts || {};
      var kind = json ? 'plan' : 'chat';
      if (aiCount(kind, json ? (A.dailyPlan || 6) : (A.dailyChat || 40), false)) return Promise.reject(aiErr('rate_limited'));
      var prompt = typeof input === 'string' ? input : (input || []).map(function (m) { return (m.role === 'user' ? 'Member: ' : 'Assistant: ') + m.content; }).join('\n');
      var cancelled = false, timer, gone = new Promise(function (_, rej) {
        if (opts.signal) { if (opts.signal.aborted) rej(aiErr('cancelled')); else opts.signal.addEventListener('abort', function () { cancelled = true; rej(aiErr('cancelled')); }); }
        timer = setTimeout(function () { rej(aiErr('timeout')); }, json ? 90000 : 45000);
      });
      var work = aiLoad(A).then(function (m) {
        var gen = m.b.getGenerativeModel(m.ai, { model: (json ? A.builderModel : A.chatModel) || A.model || 'gemini-3.8-flash', generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.5, maxOutputTokens: 8192 } : { temperature: 0.7, maxOutputTokens: 700 } });
        return gen.generateContent(prompt);
      }).then(function (r) { return r.response.text(); });
      return Promise.race([work, gone]).then(function (t) { clearTimeout(timer); aiCount(kind, 0, true); return String(t || ''); }, function (e) {
        clearTimeout(timer);
        if (e && e.code === 'cancelled') throw e;
        var m = String((e && (e.code || '') + ' ' + (e && e.message || '')).toLowerCase());
        if (/429|quota|rate|exhaust/.test(m)) throw aiErr('rate_limited');
        if (/403|permission|not enabled|has not been used|api key|app.?check|unauth/.test(m)) throw aiErr('not_granted');
        throw aiErr('failed');
      });
    }
    var sample = function (input, opts) { return run(input, opts, false).then(function (t) { return { text: t, truncated: false }; }); };
    sample.json = function (input, opts) {
      return run(input, opts, true).then(function (t) {
        var s = t.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
        try { return JSON.parse(s); } catch (e) { throw aiErr('bad_json'); }
      });
    };
    return Promise.resolve(sample);
  };

  /* ---------- sign-in screen ---------- */
  var gate = null;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function css() {
    if (document.getElementById('rfgcss')) return;
    var s = document.createElement('style'); s.id = 'rfgcss';
    s.textContent = '#rfgate{position:fixed;inset:0;z-index:2147483000;overflow:auto;background:#0F1B2D;color:#0F1B2D;font-family:"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:flex-start;justify-content:center;padding:max(24px,env(safe-area-inset-top)) 16px 32px}' +
      '#rfgate .rfw{width:100%;max-width:400px;margin:auto 0}#rfgate .rfl{display:flex;align-items:center;gap:10px;color:#fff;font-weight:800;font-size:24px;margin-bottom:18px}' +
      '#rfgate .rfb{width:44px;height:44px;border-radius:12px;background:#0F1B2D;border:2px solid #FF7A00;display:grid;place-items:center;font-size:15px;color:#fff}' +
      '#rfgate .rfc{background:#fff;border-radius:18px;padding:22px}#rfgate h1{font-size:22px;margin:0 0 4px}#rfgate p{margin:0 0 12px;color:#58627A;font-size:15px;line-height:1.45}' +
      '#rfgate label{display:block;font-weight:700;font-size:14px;margin:12px 0 4px}#rfgate input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:12px;border:1px solid #DCDEE3;border-radius:10px}' +
      '#rfgate input:focus{outline:3px solid #FF7A00;outline-offset:1px}#rfgate button{font:inherit;font-weight:700;cursor:pointer}' +
      '#rfgate .rfp{width:100%;margin-top:16px;padding:14px;border:0;border-radius:999px;background:#FF7A00;color:#0F1B2D;font-size:16px}#rfgate .rfp[disabled]{opacity:.6}' +
      '#rfgate .rfs{display:block;width:100%;margin-top:10px;padding:13px;border:2px solid #0F1B2D;border-radius:999px;background:#fff;color:#0F1B2D;font-size:16px;text-align:center;text-decoration:none;box-sizing:border-box}' +
      '#rfgate .rfk{background:none;border:0;color:#B34F00;text-decoration:underline;padding:6px 0;font-size:15px}#rfgate .rfm{min-height:20px;margin:10px 0 0;font-size:14px;color:#B42318}#rfgate .rfm.ok{color:#067647}' +
      '#rfgate .rfcb{display:flex;gap:10px;align-items:flex-start;font-weight:500;font-size:14px;line-height:1.45;margin:16px 0 0;color:#3D4552}#rfgate .rfcb input{width:20px;height:20px;flex:0 0 20px;margin:1px 0 0;padding:0;accent-color:#FF7A00}#rfgate .rfcb a{color:#B34F00}' + '#rfgate .rfx{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;margin-top:10px}';
    document.head.appendChild(s);
  }
  function setInert(on) {
    Array.prototype.forEach.call(document.body.children, function (el) { if (el !== gate) { try { on ? el.setAttribute('inert', '') : el.removeAttribute('inert'); } catch (e) {} } });
  }
  function show(inner) {
    css();
    if (!gate) { gate = document.createElement('div'); gate.id = 'rfgate'; gate.setAttribute('role', 'dialog'); gate.setAttribute('aria-modal', 'true'); gate.setAttribute('aria-label', 'Sign in to RespondFit'); document.body.appendChild(gate); }
    gate.innerHTML = '<div class="rfw"><div class="rfl"><span class="rfb">RF</span>RespondFit</div><div class="rfc">' + inner + '</div></div>';
    setInert(true);
    var f = gate.querySelector('input,button'); if (f) { try { f.focus({ preventScroll: true }); } catch (e) {} }
  }
  function hide() { if (gate) { gate.remove(); gate = null; } setInert(false); }
  function msg(t, ok) { var m = document.getElementById('rfm'); if (m) { m.textContent = t || ''; m.className = 'rfm' + (ok ? ' ok' : ''); } }
  function ready$(id) { return document.getElementById(id); }

  function errText(e) {
    var c = (e && e.code) || '';
    var t = {
      'auth/invalid-email': 'That email address does not look right.', 'auth/missing-password': 'Enter your password.',
      'auth/email-already-in-use': 'That email already has an account. Try signing in.', 'auth/weak-password': 'Choose a password with at least 8 characters.',
      'auth/user-not-found': 'No account with that email. Check it or create an account.', 'auth/wrong-password': 'That password is not right.',
      'auth/invalid-credential': 'Email or password is not right.', 'auth/invalid-login-credentials': 'Email or password is not right.',
      'auth/too-many-requests': 'Too many tries. Wait a few minutes, or reset your password.', 'auth/network-request-failed': 'No internet connection. Try again when you are online.',
      'auth/user-disabled': 'This account has been turned off. Contact your coach.'
    };
    return t[c] || 'Something went wrong. Try again.';
  }

  function showSetup() {
    show('<h1>Almost ready</h1><p>This copy of RespondFit has not been connected to its sign-in service yet. Follow SETUP-GUIDE.txt (step 3) to paste in the Firebase settings, then reload this page.</p>');
  }
  function showOffline() {
    show('<h1>You are offline</h1><p>RespondFit could not load its sign-in service. Check your connection and try again.</p><button class="rfp" id="rfre">Try again</button>');
    ready$('rfre').onclick = function () { location.reload(); };
  }
  var mode = /signup|create/i.test(location.hash + location.search) ? 'up' : 'in';
  function showSignIn(note) {
    var up = mode === 'up', rs = mode === 'reset';
    show('<h1>' + (up ? 'Create your account' : rs ? 'Reset your password' : 'Sign in') + '</h1><p>' +
      (up ? 'Join RespondFit. Use the email you will pay with.' : rs ? 'We will email you a link to choose a new password.' : 'Welcome back. Sign in to carry on training.') + '</p>' +
      '<form id="rff" novalidate>' +
      (up ? '<label for="rfn">Your name</label><input id="rfn" autocomplete="name" maxlength="60">' : '') +
      '<label for="rfe">Email</label><input id="rfe" type="email" autocomplete="email" inputmode="email" autocapitalize="off">' +
      (rs ? '' : '<label for="rfpw">Password' + (up ? ' (8 or more characters)' : '') + '</label><input id="rfpw" type="password" autocomplete="' + (up ? 'new-password' : 'current-password') + '">') +
      (up ? '<label class="rfcb" for="rfok"><input id="rfok" type="checkbox"><span>I have read and agree to the <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>, and I consent to RespondFit collecting my health and fitness information to provide the app.</span></label>' : '') + '<p class="rfm' + (note ? ' ok' : '') + '" id="rfm" role="status" aria-live="polite">' + esc(note || '') + '</p>' +
      '<button class="rfp" id="rfgo" type="submit">' + (up ? 'Create account' : rs ? 'Send reset link' : 'Sign in') + '</button></form>' +
      '<div class="rfx">' + (rs ? '<button class="rfk" id="rfa">Back to sign in</button>' :
        (up ? '<button class="rfk" id="rfa">I already have an account</button>' : '<button class="rfk" id="rfa">Create an account</button><button class="rfk" id="rfr">Forgot password?</button>')) + '</div>');
    ready$('rfa').onclick = function () { mode = (mode === 'in') ? 'up' : 'in'; showSignIn(); };
    var rb = ready$('rfr'); if (rb) rb.onclick = function () { mode = 'reset'; showSignIn(); };
    ready$('rff').onsubmit = function (ev) {
      ev.preventDefault();
      var em = ready$('rfe').value.trim(), pw = ready$('rfpw') ? ready$('rfpw').value : '', nm = ready$('rfn') ? ready$('rfn').value.trim() : '';
      if (!em) { msg('Enter your email.'); return; }
      if (up && !nm) { msg('Enter your name.'); return; }
      if (!rs && !pw) { msg('Enter your password.'); return; }
      if (up && pw.length < 8) { msg('Choose a password with at least 8 characters.'); return; } if (up && !(ready$('rfok') && ready$('rfok').checked)) { msg('Please tick the box to agree to the Privacy Policy.'); return; } if (up) ST.consentAt = Date.now();
      var b = ready$('rfgo'); b.disabled = true; msg('');
      var A = FB.auth, p;
      if (rs) p = A.sendPasswordResetEmail(ST.auth, em).then(function () { mode = 'in'; showSignIn('If that email has an account, a reset link is on its way.'); return 'stop'; });
      else if (up) { ST.pendingName = nm; p = A.createUserWithEmailAndPassword(ST.auth, em, pw).then(function (cr) { return A.updateProfile(cr.user, { displayName: nm }).catch(function () {}); }); }
      else p = A.signInWithEmailAndPassword(ST.auth, em, pw);
      p.then(function (r) { if (r !== 'stop') msg('Signing you in…', true); }, function (e) { b.disabled = false; msg(errText(e)); });
    };
  }
  function showPaywall() {
    var w = LINKS.weekly ? '<a class="rfs" target="_blank" rel="noopener" href="' + esc(LINKS.weekly) + '">Join weekly · $5</a>' : '';
    var m = LINKS.monthly ? '<a class="rfs" target="_blank" rel="noopener" href="' + esc(LINKS.monthly) + '">Join monthly · $15</a>' : '';
    show('<h1>Membership needed</h1><p>Hi ' + esc((ST.user && ST.user.displayName) || 'there') + '. Your account (' + esc(ST.user.email || '') + ') is set up, but your membership is not active yet.</p>' +
      '<p>Join below using the same email. Your coach switches you on once payment is confirmed. Then tap Check again.</p>' + w + m +
      '<p class="rfm" id="rfm" role="status" aria-live="polite"></p><button class="rfp" id="rfck">Check again</button>' +
      '<div class="rfx"><button class="rfk" id="rfso">Sign out</button></div>');
    ready$('rfck').onclick = function () { var b = this; b.disabled = true; msg('Checking…', true); proceed().then(function () { if (!resolved) { b.disabled = false; msg('Not active yet. Try again in a little while.'); } }); };
    ready$('rfso').onclick = window.RFA.signOut;
  }

  /* ---------- local data belongs to one account per device ---------- */
  function switchLocal(uid) {
    var prev = localStorage.getItem('rf_uid');
    if (prev === uid) return false;
    var reload = false;
    if (prev) {
      var cur = localStorage.getItem(KEY); if (cur) localStorage.setItem(KEY + '-' + prev, cur);
      localStorage.removeItem(KEY); reload = true;
    }
    var mine = localStorage.getItem(KEY + '-' + uid);
    if (mine) { localStorage.setItem(KEY, mine); localStorage.removeItem(KEY + '-' + uid); reload = true; }
    localStorage.setItem('rf_uid', uid);
    return reload;
  }

  /* ---------- access check ---------- */
  function checkAccess() {
    var fs = FB.fs, db = ST.db, uid = ST.uid, ck = 'rf_acc_' + uid;
    function one(path) { var p = fs.getDoc(fs.doc.apply(null, [db].concat(path))); return p; }
    return Promise.all([one(['admins', uid]), one(['config', 'access']), one(['clients', uid, 'billing', 'status'])]).then(function (r) {
      var ad = r[0].exists(), pw = r[1].exists() && (r[1].data() || {}).paywall === true, act = !r[2].exists() || (r[2].data() || {}).state === 'active'; /* no billing record yet = active by default */
      ST.admin = ad; ST.paid = ad || !pw || act;
      try { localStorage.setItem(ck, JSON.stringify({ ad: ad, paid: ST.paid })); } catch (e) {}
    }, function (e) {
      var c = null; try { c = JSON.parse(localStorage.getItem(ck) || 'null'); } catch (x) {}
      if (c && c.paid) { ST.admin = !!c.ad; ST.paid = true; return; }
      throw e;
    });
  }
  function ensureProfile() {
    var fs = FB.fs, n = (ST.user.displayName || ST.pendingName || '').trim().slice(0, 60);
    if (!n) return Promise.resolve();
    nameCache[ST.uid] = n;
    var p1 = fs.setDoc(fs.doc(ST.db, 'profiles', ST.uid), { name: n }).catch(function () {});
    var cref = fs.doc(ST.db, 'clients', ST.uid);
    var p2 = ST.admin ? Promise.resolve() : fs.getDoc(cref).then(function (s) { var d = s.exists() ? (s.data() || {}) : null; if (d && d.consent) ST.consent = d.consent; if (!ST.consent && ST.consentAt) { ST.consent = { privacy: PV, at: ST.consentAt }; logConsent(); } if (!d) return fs.setDoc(cref, { email: ST.user.email || '', profile: { name: n }, consent: ST.consent || null, updated: Date.now() }); if (ST.consent && !d.consent) return fs.setDoc(cref, { consent: ST.consent }, { merge: true }); }).catch(function () {});
    return Promise.all([p1, p2]);
  }
  function dropAdminStub() {
    if (!ST.admin) return Promise.resolve();
    var fs = FB.fs, r = fs.doc(ST.db, 'clients', ST.uid);
    return fs.getDoc(r).then(function (s) {
      if (!s.exists()) return;
      var d = s.data() || {};
      if (!(d.workouts && d.workouts.length) && !(d.logs && d.logs.length)) return fs.deleteDoc(r);
    }).catch(function () {});
  }
  function restoreIfEmpty() {
    if (localStorage.getItem(KEY) || sessionStorage.getItem('rf_restored') === ST.uid) return Promise.resolve(false);
    var fs = FB.fs;
    return fs.getDoc(fs.doc(ST.db, 'clients', ST.uid)).then(function (s) {
      var d = s.exists() ? dec(s.data()) : null;
      if (!d || !(d.workouts && d.workouts.length || d.logs && d.logs.length || d.profile && Object.keys(d.profile).length > 1)) return false;
      var o = {}; ['profile', 'logs', 'workouts', 'custom', 'reviews', 'ft'].forEach(function (k) { if (d[k] != null) o[k] = d[k]; });
      localStorage.setItem(KEY, JSON.stringify(o)); sessionStorage.setItem('rf_restored', ST.uid); return true;
    }, function () { return false; });
  }

  var PV = 'v2.1';
  function logConsent() { try { var fs = FB.fs; fs.setDoc(fs.doc(ST.db, 'clients', ST.uid, 'consents', PV), { privacy: PV, at: (ST.consent && ST.consent.at) || Date.now(), email: (ST.user && ST.user.email) || '', ua: String(navigator.userAgent || '').slice(0, 200) }).catch(function () {}); } catch (e) {} }
  function consentOk() { return !!(ST.consent && ST.consent.privacy === PV); }
  function consentGate() { if (ST.admin || consentOk()) return Promise.resolve(); var fs = FB.fs, cref = fs.doc(ST.db, 'clients', ST.uid); return fs.getDoc(cref).then(function (s) { var d = s.exists() ? (s.data() || {}) : {}; if (d.consent) ST.consent = d.consent; }, function () {}).then(function () { if (consentOk()) return; return new Promise(function (res) { show('<h1>We\u2019ve updated our Privacy Policy</h1><p>Our Privacy Policy now covers how we use your health and fitness data, Fit Bot (AI), notifications, and general guidance that RespondFit is not medical advice. Please read it and accept to keep using the app.</p><label class="rfcb" for="rfok"><input id="rfok" type="checkbox"><span>I have read and agree to the <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>, and I consent to RespondFit collecting my health and fitness information to provide the app.</span></label><p class="rfm" id="rfm" role="status" aria-live="polite"></p><button class="rfp" id="rfgo">Continue</button><div class="rfx"><button class="rfk" id="rfso">Sign out</button></div>'); ready$('rfso').onclick = window.RFA.signOut; ready$('rfgo').onclick = function () { if (!ready$('rfok').checked) { msg('Please tick the box to agree to the Privacy Policy.'); return; } ST.consent = { privacy: PV, at: Date.now() }; fs.setDoc(cref, { consent: ST.consent }, { merge: true }).catch(function () {}); logConsent(); res(); }; }); }); }  function proceed() {
    return checkAccess().then(function () {
      return ensureProfile().then(dropAdminStub);
    }).then(function () {
      if (!ST.paid) { showPaywall(); return; }
      return consentGate().then(restoreIfEmpty).then(function (r) {
        if (r) { location.reload(); return; }
        resolved = true; hide(); okRes();
      });
    }, function () { showOffline(); });
  }
  function onUser(u) {
    if (!u) { ST.user = null; ST.uid = null; if (resolved) { location.reload(); return; } mode = mode === 'reset' ? 'reset' : mode; showSignIn(); return; }
    ST.user = u; ST.uid = u.uid;
    if (switchLocal(u.uid)) { location.reload(); return; }
    if (resolved) return;
    proceed();
  }

  /* ---------- start ---------- */
  function boot() {
    if (!configured) { showSetup(); return; }
    Promise.all([import(BASE + 'firebase-app.js'), import(BASE + 'firebase-auth.js'), import(BASE + 'firebase-firestore.js'), import(BASE + 'firebase-storage.js')]).then(function (m) {
      FB = { app: m[0], auth: m[1], fs: m[2], st: m[3] };
      var app = FB.app.initializeApp(C);
      try { ST.auth = FB.auth.initializeAuth(app, { persistence: [FB.auth.indexedDBLocalPersistence, FB.auth.browserLocalPersistence] }); } catch (e) { ST.auth = FB.auth.getAuth(app); } /* stay signed in after closing */ try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}
      try { ST.db = FB.fs.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: FB.fs.persistentLocalCache({ tabManager: FB.fs.persistentMultipleTabManager() }) }); }
      catch (e) { ST.db = FB.fs.getFirestore(app); }
      ST.stg = FB.st.getStorage(app); ST.fapp = app;
      FB.auth.onAuthStateChanged(ST.auth, onUser);
    }).catch(showOffline);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
