


// WAVES CLASSES upgraded app.js — copy this entire content into app.js.
// Student sign-in uses Google OAuth.
// Student email is captured for admin matching and approved-account linking.
// PIN login and PIN generation controls are removed from the student/admin UI.
// Bulk import currently supports CSV, TSV, JSON and structured TXT with preview.
(() => {
  // Emergency startup recovery: even if another script statement fails before
  // startApplication() is reached, never trap visitors behind the loader.
  let startupRecovered = false;
  function recoverStartup(error) {
    if (startupRecovered) return;
    startupRecovered = true;
    console.error('WAVES CLASSES startup failure:', error);
    const loader = document.getElementById('loadingScreen');
    const home = document.getElementById('publicHome');
    const auth = document.getElementById('authPanel');
    const app = document.getElementById('appPanel');
    if (home) home.classList.remove('hidden');
    if (auth) auth.classList.add('hidden');
    if (app) app.classList.add('hidden');
    const notice = document.getElementById('setupNotice');
    if (notice) {
      notice.classList.remove('hidden');
      notice.textContent = 'A website startup feature could not be loaded. Check the browser console (F12) for the error.';
    }
    if (loader) {
      loader.classList.add('loader-finished');
      loader.setAttribute('aria-hidden', 'true');
      window.setTimeout(() => { loader.style.display = 'none'; }, 700);
    }
  }
  window.addEventListener('error', event => recoverStartup(event.error || event.message));
  window.addEventListener('unhandledrejection', event => recoverStartup(event.reason || 'Unhandled promise rejection'));

  const cfg = window.APP_CONFIG || {};

  const configured =
    cfg.SUPABASE_URL &&
    !cfg.SUPABASE_URL.includes('YOUR-PROJECT') &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');

  const $ = id => document.getElementById(id);

  const publicHome = $('publicHome');
  const authPanel = $('authPanel');
  const appPanel = $('appPanel');
  const view = $('view');
  const tabs = $('tabs');

  let db = null;
  let user = null;
  let profile = null;
  let activeTab = 'home';

  const esc = v =>
    String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  const msg = (text, bad = false) => {
    $('authMessage').textContent = text;
    $('authMessage').style.color = bad ? '#b4233c' : '#315de8';
  };

  const money = n =>
    '₹' + Number(n || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2
    });

  // Supabase/PostgREST silently caps a query at 1000 rows by default, so sums over
  // fee_payments were wrong once there were more than 1000 payments. This pages
  // through the whole table. buildQuery must return a fresh query each call.
  async function fetchAll(buildQuery, pageSize = 1000) {
    const all = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await buildQuery().range(from, from + pageSize - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return all;
  }

  function setupWarning() {
    $('setupNotice').classList.remove('hidden');

    $('setupNotice').innerHTML =
      '<b>Setup required:</b> Open <code>config.js</code> and add your Supabase Project URL and anon/public key. Then run the SQL in <code>supabase-schema.sql</code>. Do not use real student data before setup and security testing.';
  }

  if (!configured || !window.supabase) {
    setupWarning();
  } else {
    db = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );
  }

  $('brand').textContent =
    cfg.COACHING_NAME || 'Coaching Management System';

  document.title = cfg.COACHING_NAME || document.title;

  // GOOGLE LOGIN
  $('googleBtn').onclick = async () => {
    if (!db) {
      return msg('Please configure Supabase in config.js first.', true);
    }

    const { error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: location.origin + location.pathname
      }
    });

    if (error) msg(error.message, true);
  };


  // PUBLIC ADMISSION REQUEST: writes only to the admission_requests table; admin approval is separate.
  const admissionButton = $('admissionSubmitBtn');
  if (admissionButton) admissionButton.onclick = async () => {
    const full_name = $('admissionName').value.trim();
    const phone = $('admissionPhone').value.trim();
    const email = $('admissionEmail').value.trim().toLowerCase();
    const batch = $('admissionClass').value.trim();
    const course_name = $('admissionCourse').value.trim();
    if (!db) return msg('Please configure Supabase in config.js first.', true);
    if (!full_name || !phone || !batch || !email) return msg('Name, email, phone, and class/batch are required.', true);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg('Please enter a valid Google email address.', true);
    admissionButton.disabled = true;
    try {
      const { error } = await db.from('admission_requests').insert({ full_name, email, phone, batch, course_name });
      if (error) return msg('Request could not be submitted: ' + error.message, true);
      msg('Your admission request has been submitted. The admin will contact you after reviewing it.');
      ['admissionName','admissionEmail','admissionPhone','admissionClass','admissionCourse'].forEach(id => { if ($(id)) $(id).value = ''; });
    } finally {
      admissionButton.disabled = false;
    }
  };

  // LANDING PAGE: admissions, feature and course information modals.
  const openAdmissionForm = $('openAdmissionForm');
  if (openAdmissionForm) openAdmissionForm.addEventListener('click', () => {
    publicHome?.classList.add('hidden');
    authPanel?.classList.remove('hidden');
    $('admissionName')?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const closeModal = modal => {
    if (modal) modal.classList.add('hidden');
  };
  document.querySelectorAll('[data-close-modal]').forEach(button => {
    button.addEventListener('click', () => closeModal($(button.dataset.closeModal)));
  });
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal); });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(closeModal);
  });
  $('openWhyJoin')?.addEventListener('click', () => $('whyJoinModal')?.classList.remove('hidden'));

  // RESULTS: open the redesigned three-image popup with a soft entrance animation.
  $('openResultsModal')?.addEventListener('click', () => {
    const modal = $('resultsModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.remove('results-modal-opening');
    void modal.offsetWidth;
    modal.classList.add('results-modal-opening');
  });

  $('openMoreReviews')?.addEventListener('click', () => $('moreReviewsModal')?.classList.remove('hidden'));

  const courseDetails = {
    foundation: { title: 'Foundation · Classes 9 & 10', teaching: 'Concept-first teaching in Mathematics and Science, step-by-step examples, classroom practice, doubt clearing and regular chapter tests.', subjects: 'Mathematics, Physics basics, Chemistry basics and Biology fundamentals, aligned with the school syllabus.', outcomes: 'Builds a strong base for Classes 11–12 and future JEE/NEET preparation. Supports school examinations and scholarship/entrance foundations.', pathways: 'School board examinations, foundation-level olympiads and a smoother transition to senior-secondary Science.' },
    commerce: { title: 'Commerce Stream · Classes 11 & 12', teaching: 'Structured explanations, numerical practice, case-based learning, writing practice and revision through tests.', subjects: 'Accountancy, Business Studies and Economics, with focus on concepts, formats, applications and exam presentation.', outcomes: 'Builds financial literacy, analytical thinking, business understanding and confidence in board examinations.', pathways: 'B.Com, BBA, Economics, management, finance, CA Foundation and related university pathways; eligibility depends on each institution.' },
    science: { title: 'Science Stream · PCM & PCB', teaching: 'Concept explanation, solved examples, diagrams, numerical practice, laboratory-linked applications and regular assessment.', subjects: 'PCM: Physics, Chemistry and Mathematics. PCB: Physics, Chemistry and Biology, based on the chosen stream.', outcomes: 'Strengthens board performance and prepares students for subject-based entrance tests and higher education.', pathways: 'PCM can support engineering, B.Sc and technical pathways; PCB can support medical, life-science and allied-health pathways. Specific eligibility varies.' },
    jee: { title: 'JEE Preparation', teaching: 'Concept building followed by graded problem solving, timed practice, previous-year questions, mock tests and error analysis.', subjects: 'Physics, Chemistry and Mathematics for JEE Main and Advanced patterns.', outcomes: 'Develops speed, accuracy, analytical problem-solving and exam strategy.', pathways: 'Engineering admissions through JEE Main/Advanced, subject to the current eligibility and counselling rules of the relevant institutes.' },
    neet: { title: 'NEET Preparation', teaching: 'NCERT-focused explanation, diagrams, memory reinforcement, question practice, chapter tests and full-length mock analysis.', subjects: 'Physics, Chemistry and Biology (Botany and Zoology), aligned to the current NEET syllabus.', outcomes: 'Builds conceptual clarity, retention, accuracy and time management for medical entrance preparation.', pathways: 'MBBS, BDS, AYUSH and other courses participating in NEET-based admission, subject to current counselling and eligibility rules.' },
    cuet: { title: 'CUET Preparation', teaching: 'Domain-wise concept revision, NCERT-based practice, question drills, mock tests and time-management strategy.', subjects: 'Selected CUET domain subjects, language and general aptitude components as applicable to the target university/course.', outcomes: 'Helps students prepare for the CUET format and make informed subject/university choices.', pathways: 'Undergraduate admissions at participating universities and programmes; subject combinations and eligibility vary by university.' }
  };
  document.querySelectorAll('.course-detail-trigger').forEach(button => {
    button.addEventListener('click', () => {
      const item = courseDetails[button.dataset.course];
      if (!item) return;
      $('courseDetailTitle').textContent = item.title;
      $('courseDetailContent').innerHTML = `
        <div class="course-detail-sections">
          <article><h3>How we teach</h3><p>${esc(item.teaching)}</p></article>
          <article><h3>What you study</h3><p>${esc(item.subjects)}</p></article>
          <article><h3>What this course builds</h3><p>${esc(item.outcomes)}</p></article>
          <article><h3>Where it can lead</h3><p>${esc(item.pathways)}</p></article>
        </div>`;
      $('courseDetailModal')?.classList.remove('hidden');
    });
  });

  // PUBLIC COUNSELLING REQUEST: save enquiries to Supabase for admin review.
  const counsellingForm = $('counsellingForm');
  if (counsellingForm) counsellingForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = $('counsellingSubmitBtn');
    const message = $('counsellingMsg');
    const full_name = $('counsellingName')?.value.trim() || '';
    const phone = ($('counsellingPhone')?.value || '').replace(/\D/g, '');
    const class_grade = $('counsellingClass')?.value.trim() || '';
    const course_name = $('counsellingCourse')?.value.trim() || '';
    const showMessage = (value, bad = false) => {
      if (!message) return;
      message.textContent = value;
      message.style.color = bad ? '#b4233c' : '#16804a';
    };
    if (!db) return showMessage('The form is temporarily unavailable. Please call WAVES CLASSES.', true);
    if (!full_name || !phone || !class_grade || !course_name) return showMessage('Please fill in all counselling details.', true);
    if (!/^\d{10}$/.test(phone)) return showMessage('Please enter a valid 10-digit mobile number.', true);
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Submitting...'; }
    showMessage('');
    try {
      const { error } = await db.from('counselling_requests').insert({ full_name, phone, class_grade, course_name });
      if (error) throw error;
      showMessage('Thank you! Your counselling request has been submitted successfully. Our team will contact you shortly.');
      counsellingForm.reset();
    } catch (error) {
      console.error('WAVES CLASSES counselling submission failed:', error);
      showMessage('Your request could not be submitted. Please try again or call WAVES CLASSES.', true);
    } finally {
      if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Submit Counselling Request'; }
    }
  });

  // LOGOUT: sign out and return directly to the public landing page.
  $('logoutBtn').onclick = async () => {
    const logoutButton = $('logoutBtn');
    if (logoutButton) logoutButton.disabled = true;

    try {
      if (db) {
        const { error } = await db.auth.signOut();
        if (error) throw error;
      }

      user = null;
      profile = null;
      showLandingPage();
    } catch (error) {
      console.error('WAVES CLASSES logout error:', error);
      // Even if the network sign-out fails, clear the local UI and return home.
      user = null;
      profile = null;
      showLandingPage();
    } finally {
      if (logoutButton) logoutButton.disabled = false;
    }
  };

  function showLandingPage() {
    document.body.classList.remove('dashboard-mode');
    if (publicHome) publicHome.classList.remove('hidden');
    if (authPanel) authPanel.classList.add('hidden');
    if (appPanel) appPanel.classList.add('hidden');

    const logoutButton = $('logoutBtn');
    if (logoutButton) logoutButton.classList.add('hidden');
    const loginButton = $('topLoginBtn');
    if (loginButton) loginButton.classList.remove('hidden');

    // Keep browser history on the public landing page after logout.
    if (location.hash === '#login') {
      history.replaceState({ wavesView: 'home' }, '', location.pathname + location.search);
    }
    // Start the visitor at the top of the public landing page.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Keep the existing helper name for any other app flow that calls it.
  function showAuth() {
    showLandingPage();
  }

  // LOGIN VIEW: push a browser-history entry so the phone back gesture/button
  // and desktop Chrome Back return to the public landing page.
  function openLoginPage(pushHistory = true) {
    document.body.classList.remove('dashboard-mode');
    if (pushHistory) {
      history.pushState({ wavesView: 'login' }, '', '#login');
    }
    if (publicHome) publicHome.classList.add('hidden');
    if (authPanel) authPanel.classList.remove('hidden');
    if (appPanel) appPanel.classList.add('hidden');
    const logoutButton = $('logoutBtn');
    if (logoutButton) logoutButton.classList.add('hidden');
    if (topLoginButton) topLoginButton.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function returnToLandingPage(replaceHistory = false) {
    if (replaceHistory) {
      history.replaceState({ wavesView: 'home' }, '', location.pathname + location.search);
    }
    showLandingPage();
  }

  const topLoginButton = $('topLoginBtn');
  if (topLoginButton) topLoginButton.addEventListener('click', () => openLoginPage(true));

  // Legacy buttons remain functional if present in older cached HTML.
  document.querySelectorAll('[data-open-login]').forEach(button => {
    button.addEventListener('click', () => openLoginPage(true));
  });

  const backHomeButton = $('backToHomeBtn');
  if (backHomeButton) {
    backHomeButton.addEventListener('click', () => {
      if (history.state && history.state.wavesView === 'login') history.back();
      else returnToLandingPage(true);
    });
  }

  window.addEventListener('popstate', event => {
    if (event.state && event.state.wavesView === 'login') {
      openLoginPage(false);
    } else if (!user) {
      returnToLandingPage(false);
    }
  });

  // CHECK EXISTING LOGIN SESSION
  async function boot() {
    if (!db) return;

    const {
      data: { session }
    } = await db.auth.getSession();

    if (session) {
      await loadUser(session.user);
    }

    db.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        if (session) {
          loadUser(session.user);
        } else {
          user = null;
          profile = null;
          showAuth();
        }
      }, 0);
    });
  }

  // loadUser can be triggered several times for one login (getSession in boot(),
  // the INITIAL_SESSION / SIGNED_IN events, and TOKEN_REFRESHED roughly hourly).
  // Without a guard it ran the student-email-link function concurrently (which can
  // produce a false "conflict" sign-out) and reset the user to the Home tab,
  // wiping whatever form they were filling in.
  let loadingUserId = null;

  async function loadUser(u) {
    if (loadingUserId === u.id) return;                 // load already in progress

    if (profile && user && user.id === u.id) {          // already loaded: token refresh etc.
      user = u;
      return;
    }

    loadingUserId = u.id;
    try {
      await loadUserInner(u);
    } finally {
      loadingUserId = null;
    }
  }

  // LOAD USER PROFILE AND CHECK APPROVAL
  async function loadUserInner(u) {
    user = u;

    // Read the existing role first. Admin/owner accounts must never call
    // the student-only email-link function.
    const { data: roleCheck, error: roleCheckError } = await db
      .from('profiles')
      .select('role')
      .eq('id', u.id)
      .maybeSingle();

    if (roleCheckError) {
      showAuth();
      msg('Could not verify the profile role: ' + roleCheckError.message, true);
      return;
    }

    // Call the linker only for student accounts or first-time Google users.
    // Existing admin/owner profiles never call this student-only function.
    if (u.email && (!roleCheck || roleCheck.role === 'student')) {
      const { data: linkResult, error: linkError } = await db.functions.invoke(
        'student-email-link',
        { body: { action: 'link' } }
      );

      if (linkError) {
        showAuth();
        msg(
          'Could not verify the student account link: ' +
          linkError.message +
          '. Please deploy or check the student-email-link Supabase Edge Function.',
          true
        );
        return;
      }

      if (linkResult?.status === 'conflict') {
        await db.auth.signOut();
        user = null;
        profile = null;
        showAuth();
        msg(
          linkResult.message ||
          'Multiple student records or an already-linked record were found for this email. Please contact the admin.',
          true
        );
        return;
      }

      // An already-approved student profile may exist before its Students row
      // is linked. Ask the Edge Function to submit an admin-review request.
      if (linkResult?.status === 'no_match' &&
          roleCheck?.role === 'student') {
        const { data: requestResult, error: requestError } =
          await db.functions.invoke('student-email-link', {
            body: { action: 'request_link' }
          });

        let resolvedRequest = requestResult;

        // Supabase JS may expose expected HTTP 409/429 responses as
        // FunctionsHttpError. Read the JSON body when available so the UI
        // can distinguish already_pending and cooldown from real failures.
        if (requestError && requestError.context) {
          try {
            const response = requestError.context;
            if (typeof response.json === 'function') {
              resolvedRequest = await response.json();
            }
          } catch (parseError) {
            console.warn('Could not read student link request response:', parseError);
          }
        }

        if (resolvedRequest?.status === 'request_submitted') {
          msg('Your student-link request has been sent to the admin.');
        } else if (resolvedRequest?.status === 'already_pending') {
          msg('Your student-link request is already under admin review.');
        } else if (resolvedRequest?.status === 'cooldown') {
          msg(
            'Please wait '  +
            (resolvedRequest.remaining_text || 'a little while') +
            ' Please wait.'
          );
        } else if (resolvedRequest?.status === 'not_eligible') {
          console.warn(resolvedRequest.message || 'The student-link request is not eligible.');
        } else if (requestError) {
          // Keep the user signed in. The profile approval check below still
          // decides whether the account is allowed into the app.
          console.warn('Student link request failed:', requestError.message);
          msg(
            'Your student record is not linked yet. Please contact the admin or try again later.',
            true
          );
        }
      }
    }

    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('id', u.id)
      .maybeSingle();

    if (error) {
      showAuth();
      msg('Could not load the profile: ' + error.message, true);
      return;
    }

    profile = data;

    if (!profile) {
      showAuth();

      msg(
        'The account was created, but the profile could not be created. Check the SQL setup and profiles table.',
        true
      );

      return;
    }

    // APPROVAL CHECK FOR EVERY ROLE (admin/owner included).
    if (profile.approval_status !== 'approved') {
      const status = profile.approval_status;

      await db.auth.signOut();

      user = null;
      profile = null;

      showAuth();

      if (status === 'rejected') {
        msg(
          'Your registration was rejected. Please contact the admin.',
          true
        );
      } else {
        msg(
          'Your registration is awaiting approval. Please wait for the admin to review it.'
        );
      }

      return;
    }

    if (publicHome) publicHome.classList.add('hidden');
    authPanel.classList.add('hidden');
    appPanel.classList.remove('hidden');

    document.body.classList.add('dashboard-mode');
    const dashboardLoginButton = $('topLoginBtn');
    if (dashboardLoginButton) dashboardLoginButton.classList.add('hidden');
    $('logoutBtn').classList.remove('hidden');

    $('welcomeTitle').textContent =
      profile.full_name ||
      u.user_metadata?.full_name ||
      u.email;

    $('roleLabel').textContent =
      profile.role.toUpperCase() + ' DASHBOARD';

    $('welcomeText').textContent =
      profile.role === 'student'
        ? 'Your records and coaching updates.'
        : profile.role === 'owner'
          ? 'Owner control: website publication status aur system access.'
          : 'Manage students, fees, academics, approvals, and notices.';

    await renderTabs();
    await renderTab('home');
  }

  // DASHBOARD TABS
  const navFor = role =>
    role === 'owner'
      ? [
          ['home', 'Overview'],
          ['counsellingRequests', 'Counselling Requests'],
          ['publish', 'Website control']
        ]
      : role === 'admin'
        ? [
            ['home', 'Overview'],
            ['students', 'Students'],
            ['approvals', 'Approvals'],
            ['admissionRequests', 'Admission Requests'],
            ['counsellingRequests', 'Counselling Requests'],
            ['fees', 'Fees'],
            ['academics', 'Academic records'],
            ['notices', 'Notices']
          ]
        : [
            ['home', 'My dashboard'],
            ['myfees', 'My fees'],
            ['myacademics', 'My academics'],
            ['notices', 'Notices']
          ];

  async function renderTabs() {
    tabs.innerHTML = navFor(profile.role)
      .map(([id, label]) => `
        <button
          data-tab="${id}"
          class="${id === activeTab ? 'active' : ''}"
        >
          ${label}
        </button>
      `)
      .join('');

    tabs.querySelectorAll('button').forEach(button => {
      button.onclick = () => renderTab(button.dataset.tab);
    });
  }

  async function renderTab(tab) {
    activeTab = tab;

    tabs.querySelectorAll('button').forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.tab === tab
      );
    });

    view.innerHTML = '<p class="muted">Loading...</p>';

    try {
      if (tab === 'home') await home();
      else if (tab === 'students') await students();
      else if (tab === 'approvals') await approvals();
      else if (tab === 'admissionRequests') await admissionRequests();
      else if (tab === 'counsellingRequests') await counsellingRequests();
      else if (tab === 'fees') await fees();
      else if (tab === 'academics') await academics();
      
      else if (tab === 'notices') {
      if (profile.role === 'student') {
      await studentNotices();
    } else if (profile.role === 'admin') {
      await notices();
    } else {
    view.innerHTML = '<div class="notice">You do not have permission to access this section.</div>';
    }
  }

      else if (tab === 'myfees') await myfees();
      else if (tab === 'myacademics') await myacademics();
      else if (tab === 'publish') await publish();
    } catch (e) {
      view.innerHTML = `
        <div class="notice">
          Data could not be loaded: ${esc(e.message)}.
          Please check the Supabase SQL setup and access policies.
        </div>
      `;
    }
  }

  // HOME DASHBOARD
  async function home() {
    const live = await db
      .from('site_settings')
      .select('is_published')
      .eq('id', 1)
      .maybeSingle();

    const published = live.data?.is_published !== false;

    $('siteBadge').textContent = published
      ? 'Website published'
      : 'Website unpublished';

    if (profile.role === 'student') {
      const s = await db
        .from('students')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      const n = await db
        .from('notices')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(5);

      view.innerHTML = `
        <h2>My dashboard</h2>

        ${
          s.data
            ? `
              <div class="grid">
                <div class="stat">
                  Student ID
                  <strong>${esc(s.data.student_code || '—')}</strong>
                </div>

                <div class="stat">
                  Name
                  <strong>${esc(s.data.full_name || '—')}</strong>
                </div>

                <div class="stat">
                  Batch / Class
                  <strong>${esc(s.data.batch || '—')}</strong>
                </div>
              </div>
            `
            : `
              <div class="notice">
                Your student profile has not been linked by the admin yet.
                Please contact the institute administrator.
              </div>
            `
        }

        <h2>Latest notices</h2>
        ${noticeCards(n.data || [])}
      `;

      return;
    }

    const [ss, ff, nn] = await Promise.all([
      db
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),

      fetchAll(() => db
        .from('fee_payments')
        .select('amount')
        .order('id')),

      db
        .from('notices')
        .select('id', { count: 'exact', head: true })
        .eq('is_published', true)
    ]);

    const total = (ff || []).reduce(
      (a, r) => a + Number(r.amount || 0),
      0
    );

    view.innerHTML = `
      <h2>Overview</h2>

      <div class="grid">
        <div class="stat">
          Registered students
          <strong>${ss.count ?? '—'} / 500</strong>
        </div>

        <div class="stat">
          Recorded fee collection
          <strong>${money(total)}</strong>
        </div>

        <div class="stat">
          Published notices
          <strong>${nn.count ?? '—'}</strong>
        </div>
      </div>

      <div class="item">
        <b>Quick note</b>
        <p class="muted">
          The admin can publish notices.
          Only the Owner role can access the website publish/unpublish controls.
        </p>
      </div>
    `;
  }

  // ADMIN: PUBLIC ADMISSION REQUESTS (read-only review list)
  async function admissionRequests() {
    if (!['admin', 'owner'].includes(profile.role)) {
      view.innerHTML = '<div class="notice">You do not have permission to access this section.</div>';
      return;
    }

    view.innerHTML = `
      <h2>Admission Requests</h2>
      <p class="muted">Applications submitted through the public admission form. Existing student records and fee records cannot be changed here.</p>
      <div id="admissionRequestSummary" class="stats"></div>
      <div class="inline-form">
        <button id="refreshAdmissionRequests" type="button">Refresh requests</button>
      </div>
      <div id="admissionRequestList"><p class="muted">Loading requests...</p></div>
    `;

    const load = async () => {
      const list = $('admissionRequestList');
      const summary = $('admissionRequestSummary');
      list.innerHTML = '<p class="muted">Loading requests...</p>';

      const { data: rows, error } = await db
        .from('admission_requests')
        .select('id,full_name,email,phone,batch,course_name,status,created_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        list.innerHTML = `<div class="notice">Admission requests could not be loaded: ${esc(error.message)}. Please check the admin SELECT policy and table permissions.</div>`;
        summary.innerHTML = '';
        return;
      }

      const requests = rows || [];
      const pendingCount = requests.filter(r => r.status === 'pending').length;
      summary.innerHTML = `
        <div class="stat">Total requests<strong>${requests.length}</strong></div>
        <div class="stat">Pending<strong>${pendingCount}</strong></div>
      `;

      list.innerHTML = requests.length ? requests.map(r => `
        <article class="item">
          <h3>${esc(r.full_name || 'Name not provided')}</h3>
          <p><b>Email:</b> ${esc(r.email || '—')}</p>
          <p><b>Phone:</b> ${esc(r.phone || '—')}</p>
          <p><b>Class / Batch:</b> ${esc(r.batch || '—')}</p>
          <p><b>Course:</b> ${esc(r.course_name || '—')}</p>
          <p><b>Status:</b> ${esc(r.status || 'pending')}</p>
          <p class="muted">Received: ${esc(r.created_at ? new Date(r.created_at).toLocaleString() : '—')}</p>
        </article>
      `).join('') : '<div class="empty">No admission requests have been received yet.</div>';
    };

    $('refreshAdmissionRequests').onclick = load;
    await load();
  }

  // ADMIN/OWNER: PUBLIC COUNSELLING ENQUIRIES (read-only inbox).
  async function counsellingRequests() {
    if (!['admin', 'owner'].includes(profile.role)) {
      view.innerHTML = '<div class="notice">You do not have permission to access counselling requests.</div>';
      return;
    }
    view.innerHTML = `
      <h2>Counselling Requests</h2>
      <p class="muted">Enquiries submitted from the public WAVES CLASSES landing page.</p>
      <div id="counsellingRequestSummary" class="stats"></div>
      <div class="inline-form"><button id="refreshCounsellingRequests" type="button">Refresh requests</button></div>
      <div id="counsellingRequestList"><p class="muted">Loading counselling requests...</p></div>
    `;
    const load = async () => {
      const list = $('counsellingRequestList');
      const summary = $('counsellingRequestSummary');
      list.innerHTML = '<p class="muted">Loading counselling requests...</p>';
      const { data: rows, error } = await db.from('counselling_requests')
        .select('id,full_name,phone,class_grade,course_name,status,created_at')
        .order('created_at', { ascending: false }).limit(500);
      if (error) {
        list.innerHTML = `<div class="notice">Counselling requests could not be loaded: ${esc(error.message)}. Run the counselling SQL and verify the admin/owner SELECT policy.</div>`;
        summary.innerHTML = '';
        return;
      }
      const requests = rows || [];
      summary.innerHTML = `
        <div class="stat">Total enquiries<strong>${requests.length}</strong></div>
        <div class="stat">New enquiries<strong>${requests.filter(r => r.status === 'new').length}</strong></div>
      `;
      list.innerHTML = requests.length ? requests.map(r => `
        <article class="item">
          <h3>${esc(r.full_name || 'Name not provided')}</h3>
          <p><b>Phone:</b> <a href="tel:${esc(r.phone || '')}">${esc(r.phone || '—')}</a></p>
          <p><b>Class / Grade:</b> ${esc(r.class_grade || '—')}</p>
          <p><b>Course Interested:</b> ${esc(r.course_name || '—')}</p>
          <p><b>Status:</b> ${esc(r.status || 'new')}</p>
          <p class="muted">Received: ${esc(r.created_at ? new Date(r.created_at).toLocaleString() : '—')}</p>
        </article>
      `).join('') : '<div class="empty">No counselling requests have been received yet.</div>';
    };
    $('refreshCounsellingRequests').onclick = load;
    await load();
  }

  // ADMIN: STUDENT APPROVALS
    // ADMIN: STUDENT APPROVALS + LINK APPROVED ACCOUNTS
  async function approvals() {
    if (!['admin', 'owner'].includes(profile.role)) {
      view.innerHTML = `
        <div class="notice">
          You do not have permission to approve registrations.
        </div>
      `;
      return;
    }

    // Google-account relinking requests are reviewed here, inside Approvals.
    const { data: linkRequests, error: linkRequestError } = await db
      .from('student_link_requests')
      .select('id,auth_user_id,email,requested_at,status,admin_note')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true })
      .limit(200);

    if (linkRequestError) {
      view.innerHTML = `
        <div class="notice">
          Student link requests could not be loaded: ${esc(linkRequestError.message)}.
          Please verify the student_link_requests SELECT policy and table permissions.
        </div>
      `;
      return;
    }

    const { data: availableStudents, error: availableStudentsError } = await db
      .from('students')
      .select('id,full_name,student_code,user_id')
      .eq('is_active', true)
      .is('user_id', null)
      .order('full_name')
      .limit(1000);

    if (availableStudentsError) {
      view.innerHTML = `
        <div class="notice">
          Available student records could not be loaded: ${esc(availableStudentsError.message)}.
        </div>
      `;
      return;
    }

    const { data: pending, error: pendingError } = await db
      .from('profiles')
      .select('id,full_name,role,approval_status,created_at')
      .eq('role', 'student')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(200);

    if (pendingError) {
      view.innerHTML = `
        <div class="notice">
          Pending registrations could not be loaded:
          ${esc(pendingError.message)}.
          Please check the profiles read policy in Supabase.
        </div>
      `;
      return;
    }

    const { data: approved, error: approvedError } = await db
      .from('profiles')
      .select('id,full_name,role,approval_status,created_at')
      .eq('role', 'student')
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: true })
      .limit(500);

    if (approvedError) {
      view.innerHTML = `
        <div class="notice">
          Approved student accounts could not be loaded:
          ${esc(approvedError.message)}.
          Please check the profiles read policy in Supabase.
        </div>
      `;
      return;
    }

    const { data: linkedRows, error: linkedError } = await db
      .from('students')
      .select('user_id')
      .not('user_id', 'is', null)
      .limit(1000);

    if (linkedError) {
      view.innerHTML = `
        <div class="notice">
          Could not check linked students:
          ${esc(linkedError.message)}.
          Please check the students read policy in Supabase.
        </div>
      `;
      return;
    }

    const linkedIds = new Set(
      (linkedRows || []).map(row => row.user_id)
    );

    const unlinked = (approved || []).filter(
      p => !linkedIds.has(p.id)
    );

    view.innerHTML = `
      <h2>Student account linking requests</h2>
      <p class="muted">Students who already have dashboard access but need their Google account linked to an existing student record. Select the correct existing record manually. No automatic email matching or new student creation is performed here.</p>
      <div class="inline-form">
        <button id="refreshStudentLinkRequests" type="button">Refresh link requests</button>
      </div>
      <div id="studentLinkRequestList"></div>

      <h2>Student approval requests</h2>

      <p class="muted">
        Approve or reject the pending registration.
        The approved account does not have a student record yet,
        so create and link one below.
      </p>

      <div id="approvalList"></div>

      <h2>Approved accounts not linked to Students</h2>

      <p class="muted">
        These accounts are approved, but no linked row was found in the Students table for them.
        No linked row was found. Linking will create a student record; fees will start at 0.
      </p>

      <div id="unlinkedList"></div>
    `;

    const linkRequestList = $('studentLinkRequestList');
    linkRequestList.innerHTML = (linkRequests || []).length
      ? linkRequests.map(r => `
          <article class="item">
            <h3>${esc(r.email || 'Email unavailable')}</h3>
            <p><b>Auth User ID:</b> ${esc(r.auth_user_id)}</p>
            <p class="muted">Requested: ${esc(r.requested_at ? new Date(r.requested_at).toLocaleString() : '—')}</p>
            <label>
              Select the matching existing student record
              <select class="link-request-student" data-request-id="${esc(r.id)}">
                <option value="">Choose student carefully</option>
                ${(availableStudents || []).map(st => `<option value="${esc(st.id)}">${esc(st.full_name)} — ${esc(st.student_code || 'No Student ID')}</option>`).join('')}
              </select>
            </label>
            <button class="confirm-student-link" data-request-id="${esc(r.id)}" data-auth-id="${esc(r.auth_user_id)}">Confirm link</button>
            <button class="danger reject-student-link" data-request-id="${esc(r.id)}">Reject request</button>
          </article>
        `).join('')
      : '<div class="empty">There are no pending student account-linking requests.</div>';

    $('refreshStudentLinkRequests').onclick = () => approvals();

    document.querySelectorAll('.confirm-student-link').forEach(button => {
      button.onclick = async () => {
        const requestId = button.dataset.requestId;
        const authId = button.dataset.authId;
        const selector = document.querySelector(`.link-request-student[data-request-id="${requestId}"]`);
        const studentId = selector?.value;
        if (!studentId) return alert('Please select the exact existing student record first.');
        if (!confirm('Confirm that this selected student record belongs to the Google account in this request?')) return;
        button.disabled = true;
        button.textContent = 'Linking...';

        const { data: alreadyLinked, error: checkError } = await db
          .from('students').select('id').eq('user_id', authId).maybeSingle();
        if (checkError || alreadyLinked) {
          alert(checkError ? checkError.message : 'This Google account is already linked to a student record.');
          await approvals();
          return;
        }

        const { data: linkedStudent, error: linkError } = await db
          .from('students').update({ user_id: authId })
          .eq('id', studentId).is('user_id', null).select('id').maybeSingle();
        if (linkError || !linkedStudent) {
          alert(linkError ? 'Link failed: ' + linkError.message : 'This student record is no longer available for linking. Refresh and verify again.');
          await approvals();
          return;
        }

        const { error: requestUpdateError } = await db
          .from('student_link_requests')
          .update({ status: 'linked', reviewed_at: new Date().toISOString(), reviewed_by: user.id })
          .eq('id', requestId).eq('status', 'pending');
        if (requestUpdateError) {
          alert('Student account has been linked, but the request status could not be updated. Please refresh and check this request: ' + requestUpdateError.message);
          await approvals();
          return;
        }
        alert('Google account successfully linked to the selected existing student record.');
        await approvals();
      };
    });

    document.querySelectorAll('.reject-student-link').forEach(button => {
      button.onclick = async () => {
        if (!confirm('Reject this student account-linking request?')) return;
        button.disabled = true;
        const { error } = await db.from('student_link_requests')
          .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user.id })
          .eq('id', button.dataset.requestId).eq('status', 'pending');
        if (error) {
          alert('Request could not be rejected: ' + error.message);
          button.disabled = false;
          return;
        }
        await approvals();
      };
    });

    $('approvalList').innerHTML = pending.length
      ? pending.map(p => `
          <div class="item">
            <h3>${esc(p.full_name || 'Name not provided')}</h3>

            <p class="muted">
              Registered:
              ${esc(new Date(p.created_at).toLocaleString())}
            </p>

            <button
              class="approve-user"
              data-id="${esc(p.id)}"
              data-decision="approved"
            >
              Approve
            </button>

            <button
              class="danger approve-user"
              data-id="${esc(p.id)}"
              data-decision="rejected"
            >
              Reject
            </button>
          </div>
        `).join('')
      : '<div class="empty">There are no pending student registrations.</div>';

    $('unlinkedList').innerHTML = unlinked.length
      ? unlinked.map(p => `
          <div class="item">
            <h3>${esc(p.full_name || 'Name not provided')}</h3>

            <p class="muted">
              Account ID: ${esc(p.id)}
            </p>

            <label>
              Student name
              <input
                class="link-student-name"
                data-id="${esc(p.id)}"
                value="${esc(p.full_name || '')}"
                placeholder="Student ka poora naam"
              >
            </label>

            <label>
              Student ID
              <input
                class="link-student-code"
                data-id="${esc(p.id)}"
                value="STU-${esc(
                  p.id.replace(/-/g, '').slice(0, 8).toUpperCase()
                )}"
                required
              >
            </label>

            <label>
              Class / Batch
              <input
                class="link-student-batch"
                data-id="${esc(p.id)}"
                placeholder="Jaise Class 10 / Batch A"
              >
            </label>

            <label>
              Total fees (₹)
              <input
                class="link-student-fees"
                data-id="${esc(p.id)}"
                type="number"
                min="0"
                value="0"
              >
            </label>

            <button
              class="link-approved-student"
              data-id="${esc(p.id)}"
            >
              Create and link student
            </button>
          </div>
        `).join('')
      : '<div class="empty">No approved accounts without a student link were found.</div>';

    document.querySelectorAll('.approve-user').forEach(button => {
      button.onclick = async () => {
        const decision = button.dataset.decision;

        if (
          !confirm(
            `Is student ko ${
              decision === 'approved' ? 'approve' : 'reject'
            } ?`
          )
        ) {
          return;
        }

        button.disabled = true;

        const { error: rpcError } = await db.rpc(
          'review_student_registration',
          {
            target_user_id: button.dataset.id,
            decision
          }
        );

        if (rpcError) {
          alert('Approval could not be updated: ' + rpcError.message);
          button.disabled = false;
          return;
        }

        await approvals();
      };
    });

    document.querySelectorAll('.link-approved-student').forEach(button => {
      button.onclick = async () => {
        const id = button.dataset.id;

        const nameInput = document.querySelector(
          `.link-student-name[data-id="${id}"]`
        );

        const codeInput = document.querySelector(
          `.link-student-code[data-id="${id}"]`
        );

        const batchInput = document.querySelector(
          `.link-student-batch[data-id="${id}"]`
        );

        const feesInput = document.querySelector(
          `.link-student-fees[data-id="${id}"]`
        );

        const fullName = nameInput.value.trim();
        const studentCode = codeInput.value.trim();
        const totalFees = Number(feesInput.value || 0);

        if (!fullName) {
          alert("Please enter the student's full name.");
          nameInput.focus();
          return;
        }

        if (!studentCode) {
          alert('Student ID is required.');
          codeInput.focus();
          return;
        }

        if (!Number.isFinite(totalFees) || totalFees < 0) {
          alert('Total fees must be zero or greater.');
          feesInput.focus();
          return;
        }

        if (
          !confirm(
            `Create a student record for ${fullName} and link it to this account?`
          )
        ) {
          return;
        }

        button.disabled = true;
        button.textContent = 'Linking...';

        const { data: existing, error: existingError } = await db
          .from('students')
          .select('id')
          .eq('user_id', id)
          .maybeSingle();

        if (existingError) {
          alert('Could not check the existing link: ' + existingError.message);
          button.disabled = false;
          button.textContent = 'Create and link student';
          return;
        }

        if (existing) {
          alert('A student record is already linked to this account.');
          await approvals();
          return;
        }

        const row = {
          user_id: id,
          full_name: fullName,
          student_code: studentCode,
          batch: batchInput.value.trim() || null,
          course_name: null,
          total_fees: totalFees,
          is_active: true
        };

        const { error: insertError } = await db
          .from('students')
          .insert(row);

        if (insertError) {
          alert(
            'The student record could not be created: ' +
            insertError.message +
            '\n\nIf this is a permission/RLS error, check the admin insert policy in Supabase.'
          );

          button.disabled = false;
          button.textContent = 'Create and link student';
          return;
        }

        alert('The student record was created and linked to the account.');
        await approvals();
      };
    });
  }

  // STUDENTS MANAGEMENT
  async function students() {
    const { data, error } = await db
      .from('students')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
      .limit(500);

    if (error) throw error;

    const feeRows = await fetchAll(() => db
      .from('fee_payments')
      .select('student_id,amount')
      .order('id'));

    const paidByStudent = new Map();
    (feeRows || []).forEach(payment => {
      const key = payment.student_id;
      paidByStudent.set(key, (paidByStudent.get(key) || 0) + Number(payment.amount || 0));
    });

    view.innerHTML = `
      <h2>
        Students
        <small class="muted">(${data.length}/500)</small>
      </h2>

      <div class="inline-form">
        <input id="studentSearch" type="search" autocomplete="off" placeholder="Search by name, Student ID, class, or course...">
        <small class="muted">Search by name, ID, class, or course.</small>
      </div>

      <div class="item">
        <h3>Bulk student import</h3>
        <p class="muted">CSV, TSV, JSON, and structured TXT files are supported. A preview and duplicate check will run before import. XLS/XLSX and PDF/DOCX require file-parser libraries; scanned PDFs and images require OCR.</p>
        <input id="studentImportFile" type="file" accept=".csv,.tsv,.txt,.json,text/*,application/json">
        <button id="previewStudentImport" type="button">Preview import</button>
        <div id="studentImportPreview"></div>
      </div>

      <div class="inline-form">
        <button id="newStudent" type="button"></button>
      </div>
      <div id="studentTable"></div>
      <div id="studentForm"></div>
    `;

    const draw = () => {
      // Google-style partial search across every field returned for each student.
      // Multiple words are supported; every word must match somewhere in the row.
      const normalizeSearch = value => String(value ?? '')
        .normalize('NFKD')
        .toLocaleLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{M}\p{N}@.+-]+/gu, ' ')
        .trim();
      const searchTerms = normalizeSearch($('studentSearch').value)
        .split(/\s+/)
        .filter(Boolean);

      const rows = data.filter(student => {
        const searchableText = normalizeSearch(
          [student.full_name, student.email, student.student_code, student.batch, student.course_name].join(' ')
        );
        return searchTerms.every(term => searchableText.includes(term));
      });

      $('studentTable').innerHTML = rows.length
        ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email ID</th>
                  <th>Student ID</th>
                  <th>Batch / Class</th>
                  <th>Course</th>
                  <th>Total fees</th>
                  <th>Paid</th>
                  <th>Pending</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                ${rows.map(s => `
                  <tr>
                    <td>${esc(s.full_name)}</td>
                    <td>${esc(s.email || '—')}</td>
                    <td>${esc(s.student_code)}</td>
                    <td>${esc(s.batch)}</td>
                    <td>${esc(s.course_name || '—')}</td>
                    <td>${money(s.total_fees)}</td>
                    <td>${money(paidByStudent.get(s.id) || 0)}</td>
                    <td>${money(Math.max(0, Number(s.total_fees || 0) - (paidByStudent.get(s.id) || 0)))}</td>
                    <td>
                      <button
                        class="secondary student-fees-btn"
                        data-id="${s.id}"
                      >
                        Fees details
                      </button>
                      <button
                        class="secondary edit-student"
                        data-id="${s.id}"
                      >
                        Edit
                      </button>

                      <button
                        class="danger remove-student"
                        data-id="${s.id}"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `
        : '<div class="empty">Student not found.</div>';

      document.querySelectorAll('.edit-student').forEach(button => {
        button.onclick = () => {
          studentForm(data.find(s => s.id === button.dataset.id));
        };
      });

      document.querySelectorAll('.student-fees-btn').forEach(button => {
        button.onclick = async () => {
          const student = data.find(x => x.id === button.dataset.id);
          if (!student) return alert('Student not found.');
          button.disabled = true;
          button.textContent = 'Loading...';
          try {
            const { data: payments, error: paymentError } = await db
              .from('fee_payments')
              .select('amount,payment_method,paid_at')
              .eq('student_id', student.id)
              .order('paid_at', { ascending: false });
            if (paymentError) throw paymentError;

            const total = Math.max(0, Number(student.total_fees || 0));
            const paid = (payments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
            const pending = Math.max(0, total - paid);
            const paidPercent = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
            const modal = document.createElement('div');
            modal.className = 'fee-detail-overlay';
            modal.innerHTML = `
              <section class="fee-detail-panel" role="dialog" aria-modal="true" aria-label="Student fee details">
                <div class="fee-detail-heading">
                  <div><h2>Fees details</h2><p>${esc(student.full_name)} · ${esc(student.student_code || '')}</p></div>
                  <button type="button" class="secondary fee-detail-close">Close</button>
                </div>
                <div class="fee-detail-stats">
                  <div class="stat"><span>Total fees</span><strong>${money(total)}</strong></div>
                  <div class="stat"><span>Paid fees</span><strong>${money(paid)}</strong></div>
                  <div class="stat"><span>Pending fees</span><strong>${money(pending)}</strong></div>
                </div>
                <h3>Payment progress</h3>
                <div class="fee-progress-track"><div class="fee-progress-paid" style="width:${paidPercent}%"></div></div>
                <p class="muted">${total > 0 ? `${paidPercent.toFixed(1)}% paid · ${(100-paidPercent).toFixed(1)}% pending` : 'Total fees have not been set.'}</p>
                <h3>Payment history</h3>
                ${(payments || []).length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Method</th></tr></thead><tbody>${payments.map(row => `<tr><td>${esc(row.paid_at ? new Date(row.paid_at).toLocaleString() : '—')}</td><td>${money(row.amount)}</td><td>${esc(row.payment_method || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">There are no payment records yet.</div>'}
              </section>`;
            document.body.appendChild(modal);
            const close = () => modal.remove();
            modal.querySelector('.fee-detail-close').onclick = close;
            modal.addEventListener('click', event => { if (event.target === modal) close(); });
          } catch (error) {
            alert('Fee details could not be loaded: ' + error.message);
          } finally {
            button.disabled = false;
            button.textContent = 'Fees details';
          }
        };
      });

      document.querySelectorAll('.remove-student').forEach(button => {
        button.onclick = async () => {
          const student = data.find(
            s => s.id === button.dataset.id
          );

          if (!student) {
            alert('Student not found.');
            return;
          }

          const confirmed = confirm(
            `Are you sure you want to ${student.full_name}?\n\n` +
            'Uska login access band ho jayega aur student ka slot khaali ho jayega. ' +
            'Purane fees aur academic records safe rahenge.'
          );

          if (!confirmed) return;

          button.disabled = true;
          button.textContent = 'Removing...';

          const { error: removeError } = await db.rpc(
            'remove_student',
            {
              target_student_id: student.id
            }
          );

          if (removeError) {
            alert('The student could not be removed: ' + removeError.message);
            button.disabled = false;
            button.textContent = 'Remove';
            return;
          }

          alert('The student was removed successfully.');
          await students();
        };
      });
    };

    $('studentSearch').oninput = draw;

    $('previewStudentImport').onclick = async () => {
      const file = $('studentImportFile').files[0];
      if (!file) return alert('Please select a file first.');
      const ext = file.name.split('.').pop().toLowerCase();
      let rows = [];
      try {
        const raw = await file.text();
        if (ext === 'json') {
          const parsed = JSON.parse(raw);
          rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.students) ? parsed.students : []);
          if (!rows.length) {
            throw new Error('No student list was found in the JSON file.');
          }
        } else {
          // Parse CSV/TSV/TXT safely, including UTF-8 BOM, CRLF and quoted commas.
          const cleanRaw = raw.replace(/^\uFEFF/, '');
          const firstNonEmptyLine = cleanRaw.split(/\r?\n/).find(line => line.trim()) || '';
          if (!firstNonEmptyLine) {
            throw new Error('The file is empty or contains no readable rows.');
          }

          // Pick the delimiter that appears most in the header line (structured .txt
          // files are often tab- or pipe-separated, which the old check treated as one column).
          const delimiter = ext === 'tsv'
            ? '\t'
            : ['\t', ',', ';', '|'].reduce((best, d) => {
                const count = firstNonEmptyLine.split(d).length - 1;
                return count > best.count ? { d, count } : best;
              }, { d: ',', count: 0 }).d;

          const parseDelimited = input => {
            const matrix = [];
            let row = [];
            let cell = '';
            let quoted = false;

            for (let i = 0; i < input.length; i++) {
              const ch = input[i];
              if (ch === '"' && quoted && input[i + 1] === '"') {
                cell += '"';
                i++;
              } else if (ch === '"') {
                quoted = !quoted;
              } else if (ch === delimiter && !quoted) {
                row.push(cell.trim());
                cell = '';
              } else if ((ch === '\n' || ch === '\r') && !quoted) {
                if (ch === '\r' && input[i + 1] === '\n') i++;
                row.push(cell.trim());
                if (row.some(value => value !== '')) matrix.push(row);
                row = [];
                cell = '';
              } else {
                cell += ch;
              }
            }

            row.push(cell.trim());
            if (row.some(value => value !== '')) matrix.push(row);
            if (quoted) throw new Error('A quotation mark is unmatched in the CSV file.');
            return matrix;
          };

          const matrix = parseDelimited(cleanRaw);
          if (matrix.length < 2) {
            throw new Error('No student rows were found below the header.');
          }

          const headers = matrix.shift().map(value =>
            value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
          );

          if (!headers.some(Boolean)) {
            throw new Error('The header row was not found. The first row must contain column names.');
          }

          rows = matrix.map(cells => {
            const record = {};
            headers.forEach((header, index) => {
              if (header) record[header] = cells[index] ?? '';
            });
            return record;
          }).filter(record =>
            Object.values(record).some(value => String(value ?? '').trim())
          );
        }
        const pick = (r, keys) => {
          for (const k of keys) if (r[k] != null && String(r[k]).trim()) return String(r[k]).trim();
          return '';
        };
        const existingCodes = new Set(data.map(s => String(s.student_code || '').toLowerCase()));
        const existingEmails = new Set(data.map(s => String(s.email || '').toLowerCase()).filter(Boolean));
        const seen = new Set();
        const seenEmails = new Set();
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const prepared = rows.map((r, i) => {
          const norm = Object.fromEntries(Object.entries(r || {}).map(([k,v]) => [String(k).toLowerCase().replace(/[^a-z0-9]/g,''),v]));
          const full_name = pick(norm,['fullname','name','studentname','nameofstudent','candidateName'.toLowerCase()]);
          const student_code = pick(norm,['studentid','studentcode','id','admissionno','admissionnumber','rollno','enrollmentno']);
          const batch = pick(norm,['class','batch','standard','classname','grade']);
          const course_name = pick(norm,['course','coursename','program','subject','stream']);
          const email = pick(norm,['email','emailid','googleemail','gmail','mail']).toLowerCase();
          // Accept "5,000", "₹5000", "Rs. 5,000" etc. instead of turning them into NaN.
          const feesRaw = pick(norm,['totalfees','fees','fee']).replace(/[^0-9.\-]/g, '');
          const total_fees = feesRaw === '' ? 0 : Number(feesRaw);
          const codeKey = student_code.toLowerCase();
          const emailDup = !!email && (existingEmails.has(email) || seenEmails.has(email));
          const emailBad = !!email && !emailRe.test(email);
          const duplicate = (!!codeKey && (existingCodes.has(codeKey) || seen.has(codeKey))) || emailDup;
          if (codeKey) seen.add(codeKey);
          if (email) seenEmails.add(email);
          return { row:i+1, full_name, student_code, batch, course_name, email, total_fees, duplicate, emailBad,
            valid: !!full_name && !duplicate && !emailBad && Number.isFinite(total_fees) && total_fees >= 0 };
        });
        const good = prepared.filter(x => x.valid);
        $('studentImportPreview').innerHTML = `<p>${good.length} valid · ${prepared.length-good.length} review/duplicate rows</p>
          <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>ID</th><th>Class</th><th>Course</th><th>Status</th></tr></thead>
          <tbody>${prepared.map(x=>`<tr><td>${esc(x.full_name||'Missing')}</td><td>${esc(x.email||'—')}</td><td>${esc(x.student_code||'Auto ID required')}</td><td>${esc(x.batch||'—')}</td><td>${esc(x.course_name||'—')}</td><td>${x.valid?'Ready':x.duplicate?'Duplicate':x.emailBad?'Invalid email':'Review required'}</td></tr>`).join('')}</tbody></table></div>
          <button id="confirmStudentImport" type="button" ${good.length?'':'disabled'}>Import ${good.length} valid students</button>`;
        $('confirmStudentImport')?.addEventListener('click', async event => {
          const confirmButton = event.currentTarget;
          if (confirmButton.disabled) return;
          if (!confirm(`${good.length} students?`)) return;
          // Disable immediately: a double click used to insert the whole batch twice
          // (auto-generated IDs differ, so the DB did not reject the second batch).
          confirmButton.disabled = true;
          confirmButton.textContent = 'Importing...';
          const payload = good.map((x,i)=>({full_name:x.full_name, student_code:x.student_code || `WAV-${Date.now()}-${i+1}`,
            email:x.email || null, batch:x.batch||null, course_name:x.course_name||null, total_fees:x.total_fees, is_active:true}));
          const {error: impErr} = await db.from('students').insert(payload);
          if (impErr) {
            confirmButton.disabled = false;
            confirmButton.textContent = `Import ${good.length} valid students`;
            return alert('Import failed: '+impErr.message);
          }
          alert(`${payload.length} students imported.`);
          await students();
        });
      } catch (err) { $('studentImportPreview').textContent = 'The file could not be read: '+err.message; }
    };

    $('newStudent').onclick = () => {
      studentForm(null);
    };

    function studentForm(student) {
      const editing = Boolean(student);

      $('studentForm').innerHTML = `
        <div class="item">
          <h3>${editing ? 'Edit student' : 'Add student'}</h3>
          <label>
            Full name
            <input id="sfName" required value="${esc(student?.full_name || '')}">
          </label>
          <label>
            Class
            <input id="sfBatch" required value="${esc(student?.batch || '')}" placeholder="e.g. 9, 10, 11, 12">
          </label>
          <label>
            Email ID (Google login)
            <input id="sfEmail" type="email" required value="${esc(student?.email || '')}" placeholder="student@gmail.com">
          </label>
          ${editing ? `
            <label>Course (optional)<input id="sfCourse" value="${esc(student?.course_name || '')}" placeholder="Course name (optional)"></label>
            <label>Student ID<input id="sfCode" value="${esc(student?.student_code || '')}"></label>
            <label>Total fees (₹)<input id="sfFees" type="number" min="0" value="${Number(student?.total_fees || 0)}"></label>
          ` : `
            <label>Total fees (₹)<input id="sfFees" type="number" min="0" value="0" required></label>
          `}
          <div class="actions">
            <button id="saveStudent">Save student</button>
            <button id="cancelStudent" class="secondary">Cancel</button>
          </div>
        </div>
      `;

      $('cancelStudent').onclick = () => {
        $('studentForm').innerHTML = '';
      };

      $('saveStudent').onclick = async () => {
        const fullName = $('sfName').value.trim();
        const batch = $('sfBatch').value.trim();
        const email = $('sfEmail').value.trim().toLowerCase();
        const courseName = editing ? $('sfCourse').value.trim() : '';
        const totalFees = Number($('sfFees').value || 0);
        if (!Number.isFinite(totalFees) || totalFees < 0) {
          alert('Fees 0 ya usse zyada honi chahiye.');
          return;
        }

        if (!fullName || !batch || !email) {
          alert('Student name, email, and class are required.');
          return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Please enter a valid email address.'); return; }

        let row;
        if (editing) {
          const studentCode = $('sfCode').value.trim();
          if (!studentCode) {
            alert('Student ID is required.');
            return;
          }
          if (!Number.isFinite(totalFees) || totalFees < 0) {
            alert('Total fees must be zero or greater.');
            return;
          }
          row = {
            full_name: fullName,
            email,
            student_code: studentCode,
            batch,
            course_name: courseName || null,
            total_fees: totalFees
          };
        } else {
          row = {
            full_name: fullName,
            email,
            student_code: `WAV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            batch,
            course_name: courseName || null,
            total_fees: totalFees,
            is_active: true
          };
        }

        // Disable before any await so a double click cannot start two saves.
        const saveButton = $('saveStudent');
        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';

        // Prevent assigning one Google email to multiple student records.
        // ilike treats "_" and "%" as wildcards, and "_" is common in emails
        // (john_doe@gmail.com would match johnXdoe@gmail.com), so escape them.
        const emailPattern = email.replace(/[\\%_]/g, '\\$&');
        const { data: emailMatches, error: emailCheckError } = await db
          .from('students')
          .select('id,email')
          .ilike('email', emailPattern)
          .limit(3);
        if (emailCheckError) {
          alert('Could not check for duplicate email addresses: ' + emailCheckError.message);
          saveButton.disabled = false;
          saveButton.textContent = 'Save student';
          return;
        }
        const duplicateEmail = (emailMatches || []).some(match => match.id !== student?.id);
        if (duplicateEmail) {
          alert("This email is already used in another student's record. Use a separate Google email address for each student.");
          saveButton.disabled = false;
          saveButton.textContent = 'Save student';
          $('sfEmail').focus();
          return;
        }

        let result;

        if (editing) {
          result = await db
            .from('students')
            .update(row)
            .eq('id', student.id);
        } else {
          row.is_active = true;
          result = await db.from('students').insert(row);
        }

        if (result.error) {
          alert('The student could not be saved: ' + result.error.message);
          saveButton.disabled = false;
          saveButton.textContent = 'Save student';
          return;
        }

        alert('Student details were saved successfully.');
        await students();
      };
    }

    draw();
  }
    // FEES MANAGEMENT — searchable student fee sections.
  async function fees() {
    const data = await fetchAll(() => db.from('students')
      .select('id,full_name,student_code,total_fees')
      .eq('is_active', true).order('full_name'));
    let selectedStudent = null;
    let selectedPayments = [];
    view.innerHTML = `
      <h2>Student fees</h2>
      <section class="admin-search-panel student-picker-panel">
        <label for="feeStudentSearch"><strong>Search & select student</strong></label>
        <input id="feeStudentSearch" type="search" autocomplete="off" placeholder="Type student name or ID…">
        <div id="feeStudentResults" class="student-picker-results"></div>
        <div id="feeStudentDetail"></div>
      </section>
      <form id="feeForm" class="admin-search-panel">
        <h3>Update selected student's fees</h3>
        <input type="hidden" name="student_id" value="">
        <label>Total course fees (₹)<input name="total_fees" id="feeTotalInput" type="number" min="0" step="0.01" required disabled></label>
        <div class="form-grid">
          <label>New payment amount (₹)<input name="amount" type="number" min="0.01" step="0.01" placeholder="Leave 0 if only updating total fees" disabled></label>
          <label>Payment method<select name="payment_method" disabled><option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Bank transfer">Bank transfer</option><option value="Other">Other</option></select></label>
        </div>
        <button type="submit" disabled>Save fee changes</button><p id="feeMsg" class="message"></p>
      </form>
      <h2>Recent payments</h2><div id="recentFees"></div>`;

    const form = $('feeForm');
    const setFormEnabled = enabled => [...form.elements].forEach(el => { if (el.name !== 'student_id') el.disabled = !enabled; });
    const drawStudentSearch = query => {
      const q = String(query || '').trim().toLocaleLowerCase();
      const matches = q ? data.filter(s => `${s.full_name} ${s.student_code || ''}`.toLocaleLowerCase().includes(q)).slice(0, 20) : [];
      $('feeStudentResults').innerHTML = matches.length ? matches.map(s => `<button type="button" class="student-picker-option" data-id="${esc(s.id)}"><strong>${esc(s.full_name)}</strong><small>${esc(s.student_code || 'No student ID')}</small></button>`).join('') : (q ? '<div class="empty">No matching student found.</div>' : '<p class="muted">Search by full name or student ID, then select a student.</p>');
      document.querySelectorAll('.student-picker-option').forEach(button => button.onclick = () => selectStudent(button.dataset.id));
    };
    async function selectStudent(id) {
      selectedStudent = data.find(s => s.id === id);
      if (!selectedStudent) return;
      $('feeStudentSearch').value = `${selectedStudent.full_name} — ${selectedStudent.student_code || ''}`;
      $('feeStudentResults').innerHTML = `<div class="selected-student-chip"><strong>${esc(selectedStudent.full_name)}</strong><span>${esc(selectedStudent.student_code || '')}</span><button type="button" class="secondary" id="changeFeeStudent">Change</button></div>`;
      $('changeFeeStudent').onclick = () => { selectedStudent = null; $('feeStudentSearch').value=''; $('feeStudentDetail').innerHTML=''; $('feeForm').reset(); setFormEnabled(false); $('feeStudentSearch').focus(); drawStudentSearch(''); };
      form.elements.student_id.value = selectedStudent.id;
      $('feeTotalInput').value = Number(selectedStudent.total_fees || 0);
      setFormEnabled(true);
      const { data: payments, error } = await db.from('fee_payments').select('amount,payment_method,paid_at').eq('student_id', selectedStudent.id).order('paid_at', {ascending:false});
      if (error) { $('feeStudentDetail').innerHTML = `<div class="notice">${esc(error.message)}</div>`; return; }
      selectedPayments = payments || [];
      const paid = selectedPayments.reduce((sum,p)=>sum+Number(p.amount||0),0), total=Number(selectedStudent.total_fees||0), pending=Math.max(0,total-paid), percent=total>0?Math.min(100,paid/total*100):0;
      $('feeStudentDetail').innerHTML = `<section class="fee-student-card"><div class="fee-detail-stats"><div class="stat"><span>Total fees</span><strong>${money(total)}</strong></div><div class="stat"><span>Paid</span><strong>${money(paid)}</strong></div><div class="stat"><span>Pending</span><strong>${money(pending)}</strong></div></div><div class="fee-progress-track"><div class="fee-progress-paid" style="width:${percent}%"></div></div><h4>Payment history</h4>${selectedPayments.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Method</th></tr></thead><tbody>${selectedPayments.map(p=>`<tr><td>${esc(p.paid_at?new Date(p.paid_at).toLocaleString():'—')}</td><td>${money(p.amount)}</td><td>${esc(p.payment_method||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No payments recorded yet.</div>'}</section>`;
    }
    $('feeStudentSearch').addEventListener('input', e => { selectedStudent=null; form.reset(); setFormEnabled(false); drawStudentSearch(e.target.value); });
    form.onsubmit = async e => {
      e.preventDefault();
      if (!selectedStudent || form.elements.student_id.value !== selectedStudent.id) { $('feeMsg').textContent='Please search and select a student first.'; return; }
      const totalFees=Number(form.elements.total_fees.value), amount=Number(form.elements.amount.value||0);
      if (!Number.isFinite(totalFees)||totalFees<0||!Number.isFinite(amount)||amount<0) { $('feeMsg').textContent='Please enter valid fee amounts.'; return; }
      if (amount>0 && !form.elements.payment_method.value) { $('feeMsg').textContent='Select a payment method.'; return; }
      const button=form.querySelector('button[type="submit"]'); button.disabled=true;
      try {
        const {error:updateError}=await db.from('students').update({total_fees:totalFees}).eq('id',selectedStudent.id);
        if(updateError) throw updateError;
        if(amount>0){const {error:insertError}=await db.from('fee_payments').insert({student_id:selectedStudent.id,amount,payment_method:form.elements.payment_method.value,recorded_by:user.id});if(insertError)throw insertError;}
        selectedStudent.total_fees=totalFees; $('feeMsg').textContent='Fee details updated successfully.'; form.elements.amount.value=''; await selectStudent(selectedStudent.id); await recent();
      } catch(error) { $('feeMsg').textContent='Could not save fee changes: '+error.message; }
      finally { button.disabled=false; }
    };
    async function recent() {
      const {data:rows,error}=await db.from('fee_payments').select('amount,payment_method,paid_at,students(full_name,student_code)').order('paid_at',{ascending:false}).limit(50);
      if(error) throw error;
      $('recentFees').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Student</th><th>Amount</th><th>Method</th><th>Date / time</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.students?.full_name||'Unknown')}</td><td>${money(x.amount)}</td><td>${esc(x.payment_method||'—')}</td><td>${esc(x.paid_at?new Date(x.paid_at).toLocaleString():'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">There are no payment records yet.</div>';
    }
    setFormEnabled(false); drawStudentSearch(''); await recent();
  }

  // ACADEMIC RECORDS — exact full-name CSV matching, search and edit.
  async function academics() {
    const studentsData = await fetchAll(() => db.from('students').select('id,full_name,student_code').eq('is_active', true).order('full_name'));
    view.innerHTML = `
      <h2>Academic records</h2>
      <form id="academicForm">
        <input type="hidden" name="record_id" value="">
        <section class="student-picker-panel"><label for="academicStudentSearch"><strong>Search & select student</strong></label><input id="academicStudentSearch" type="search" autocomplete="off" placeholder="Type student name or ID…"><div id="academicStudentResults" class="student-picker-results"></div><input type="hidden" name="student_id" value=""></section>
        <div class="form-grid"><label>Exam / Test<input name="exam_name" required></label><label>Subject<input name="subject" required></label><label>Marks obtained<input name="marks_obtained" type="number" min="0" step="0.01" required></label><label>Maximum marks<input name="max_marks" type="number" min="0.01" step="0.01" required></label></div>
        <label>Teacher's note<textarea name="remarks"></textarea></label>
        <div class="inline-form"><button type="submit" id="academicSaveButton">Save academic record</button><button type="button" class="secondary hidden" id="cancelAcademicEdit">Cancel edit</button></div><p id="academicMsg" class="message"></p>
      </form>
      <section class="admin-search-panel"><h2>Search student academic records</h2><input id="academicSearch" type="search" autocomplete="off" placeholder="Search by student's full name, exam or subject"><div id="academicList"></div></section>
      <section class="admin-search-panel"><h2>Bulk import academic records (CSV)</h2><p class="muted">Required columns: full_name, exam_name, subject, marks_obtained, max_marks. Optional: remarks. Names are matched exactly after normalizing letter case and spaces. Duplicate-name and unmatched students are skipped for manual review.</p><input id="academicCsvFile" type="file" accept=".csv,text/csv"><button id="previewAcademicCsv" type="button">Preview CSV</button><div id="academicCsvPreview"></div></section>`;

    const normalizeName = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
    let selectedAcademicStudent = null;
    const drawAcademicStudentSearch = query => {
      const q=normalizeName(query); const matches=q?studentsData.filter(s=>normalizeName(`${s.full_name} ${s.student_code||''}`).includes(q)).slice(0,20):[];
      $('academicStudentResults').innerHTML=matches.length?matches.map(s=>`<button type="button" class="student-picker-option" data-id="${esc(s.id)}"><strong>${esc(s.full_name)}</strong><small>${esc(s.student_code||'No student ID')}</small></button>`).join(''):(q?'<div class="empty">No matching student found.</div>':'<p class="muted">Search by full name or student ID, then select a student.</p>');
      document.querySelectorAll('#academicStudentResults .student-picker-option').forEach(b=>b.onclick=()=>selectAcademicStudent(b.dataset.id));
    };
    const selectAcademicStudent = id => { selectedAcademicStudent=studentsData.find(s=>s.id===id)||null; if(!selectedAcademicStudent)return; $('academicForm').elements.student_id.value=id; $('academicStudentSearch').value=`${selectedAcademicStudent.full_name} — ${selectedAcademicStudent.student_code||''}`; $('academicStudentResults').innerHTML=`<div class="selected-student-chip"><strong>${esc(selectedAcademicStudent.full_name)}</strong><span>${esc(selectedAcademicStudent.student_code||'')}</span><button type="button" class="secondary" id="changeAcademicStudent">Change</button></div>`; $('changeAcademicStudent').onclick=()=>{selectedAcademicStudent=null;$('academicForm').elements.student_id.value='';$('academicStudentSearch').value='';drawAcademicStudentSearch('');drawList();}; drawList(); };
    $('academicStudentSearch').addEventListener('input',e=>{selectedAcademicStudent=null;$('academicForm').elements.student_id.value='';drawAcademicStudentSearch(e.target.value);drawList();});
    const resetAcademicForm = () => { $('academicForm').reset(); $('academicForm').elements.record_id.value=''; $('academicForm').elements.student_id.value=selectedAcademicStudent?.id||''; $('academicSaveButton').textContent='Save academic record'; $('cancelAcademicEdit').classList.add('hidden'); };
    $('cancelAcademicEdit').onclick = resetAcademicForm;
    $('academicForm').onsubmit = async e => {
      e.preventDefault(); if(!selectedAcademicStudent || $('academicForm').elements.student_id.value!==selectedAcademicStudent.id){$('academicMsg').textContent='Please search and select a student first.';return;} const f = new FormData(e.target), marks=Number(f.get('marks_obtained')), maxMarks=Number(f.get('max_marks')), recordId=f.get('record_id');
      if (!Number.isFinite(marks)||!Number.isFinite(maxMarks)||marks<0||maxMarks<=0||marks>maxMarks) { $('academicMsg').textContent='Please enter valid marks. Obtained marks cannot exceed the maximum marks.'; return; }
      const payload={student_id:f.get('student_id'),exam_name:String(f.get('exam_name')).trim(),subject:String(f.get('subject')).trim(),marks_obtained:marks,max_marks:maxMarks,remarks:String(f.get('remarks')||'').trim(),updated_by:user.id};
      const btn=$('academicSaveButton'); btn.disabled=true;
      try {
        const result = recordId ? await db.from('academic_records').update(payload).eq('id',recordId) : await db.from('academic_records').insert(payload);
        if (result.error) { $('academicMsg').textContent='The academic record could not be saved: '+result.error.message; return; }
        $('academicMsg').textContent=recordId?'Academic record updated successfully.':'Academic record saved successfully.'; resetAcademicForm(); await list();
      } finally { btn.disabled=false; }
    };

    let allRows=[];
    async function list() {
      const rows=await fetchAll(() => db.from('academic_records').select('*,students(full_name,student_code)').order('created_at',{ascending:false}));
      allRows=rows||[]; drawList();
    }
    function drawList() {
      const q=normalizeName($('academicSearch')?.value||'');
      const rows=allRows.filter(a=>(!selectedAcademicStudent||a.student_id===selectedAcademicStudent.id)&&(!q||normalizeName([a.students?.full_name,a.students?.student_code,a.exam_name,a.subject].join(' ')).includes(q)));
      $('academicList').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Student</th><th>Exam</th><th>Subject</th><th>Score</th><th>Action</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(a.students?.full_name||'Unknown student')}</td><td>${esc(a.exam_name)}</td><td>${esc(a.subject)}</td><td>${esc(a.marks_obtained)} / ${esc(a.max_marks)}</td><td><button type="button" class="secondary edit-academic-record" data-id="${esc(a.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No matching academic records found.</div>';
      document.querySelectorAll('.edit-academic-record').forEach(button=>button.onclick=()=>{
        const a=allRows.find(row=>String(row.id)===button.dataset.id); if(!a)return;
        const f=$('academicForm'); f.elements.record_id.value=a.id; selectAcademicStudent(a.student_id); f.elements.student_id.value=a.student_id; f.elements.exam_name.value=a.exam_name||''; f.elements.subject.value=a.subject||''; f.elements.marks_obtained.value=a.marks_obtained; f.elements.max_marks.value=a.max_marks; f.elements.remarks.value=a.remarks||''; $('academicSaveButton').textContent='Update academic record'; $('cancelAcademicEdit').classList.remove('hidden'); f.scrollIntoView({behavior:'smooth',block:'start'});
      });
    }
    $('academicSearch').addEventListener('input',drawList);

    const parseCsv = text => {
      const rows=[]; let row=[],field='',quoted=false;
      for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1]; if(ch==='"'&&quoted&&next==='"'){field+='"';i++;} else if(ch==='"'){quoted=!quoted;} else if(ch===','&&!quoted){row.push(field);field='';} else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';} else field+=ch;}
      row.push(field);if(row.some(v=>v.trim()))rows.push(row);return rows;
    };
    $('previewAcademicCsv').onclick=async()=>{
      const file=$('academicCsvFile').files[0]; if(!file){$('academicCsvPreview').innerHTML='<div class="notice">Choose a CSV file first.</div>';return;}
      try{
        const matrix=parseCsv((await file.text()).replace(/^\uFEFF/,'')); if(matrix.length<2)throw new Error('CSV must contain a header and at least one data row.');
        const headers=matrix[0].map(v=>v.trim().toLocaleLowerCase().replace(/[\s-]+/g,'_'));
        const col=name=>headers.indexOf(name); const required=['full_name','exam_name','subject','marks_obtained','max_marks'];
        const missing=required.filter(name=>col(name)<0); if(missing.length)throw new Error('Missing required columns: '+missing.join(', '));
        const byName=new Map(); studentsData.forEach(s=>{const key=normalizeName(s.full_name);if(!byName.has(key))byName.set(key,[]);byName.get(key).push(s);});
        const prepared=matrix.slice(1).map((cells,index)=>{
          const get=name=>col(name)>=0?String(cells[col(name)]||'').trim():''; const full_name=get('full_name'), matches=byName.get(normalizeName(full_name))||[]; const marks=Number(get('marks_obtained')),max=Number(get('max_marks'));
          const valid=matches.length===1&&!!get('exam_name')&&!!get('subject')&&get('marks_obtained')!==''&&get('max_marks')!==''&&Number.isFinite(marks)&&Number.isFinite(max)&&marks>=0&&max>0&&marks<=max;
          const status=matches.length===0?'Student not found':matches.length>1?'Duplicate full name':!valid?'Invalid or incomplete marks':'Ready';
          return {row:index+2,full_name,student_id:matches.length===1?matches[0].id:null,exam_name:get('exam_name'),subject:get('subject'),marks_obtained:marks,max_marks:max,remarks:get('remarks'),valid,status};
        });
        const good=prepared.filter(x=>x.valid); window.__wavesAcademicImport=good;
        $('academicCsvPreview').innerHTML=`<p><strong>${good.length}</strong> ready · <strong>${prepared.length-good.length}</strong> need review. Nothing is uploaded until you confirm.</p><div class="table-wrap"><table><thead><tr><th>Row</th><th>Student</th><th>Exam</th><th>Subject</th><th>Status</th></tr></thead><tbody>${prepared.map(x=>`<tr><td>${x.row}</td><td>${esc(x.full_name||'—')}</td><td>${esc(x.exam_name||'—')}</td><td>${esc(x.subject||'—')}</td><td>${esc(x.status)}</td></tr>`).join('')}</tbody></table></div><button id="confirmAcademicCsv" type="button" ${good.length?'':'disabled'}>Import ${good.length} valid records</button>`;
        $('confirmAcademicCsv')?.addEventListener('click',async()=>{
          const records=window.__wavesAcademicImport||[];if(!records.length)return;if(!confirm(`Import ${records.length} academic records?`))return;const button=$('confirmAcademicCsv');button.disabled=true;button.textContent='Importing…';
          const payload=records.map(x=>({student_id:x.student_id,exam_name:x.exam_name,subject:x.subject,marks_obtained:x.marks_obtained,max_marks:x.max_marks,remarks:x.remarks||null,updated_by:user.id}));
          try{for(let i=0;i<payload.length;i+=200){const {error:insertError}=await db.from('academic_records').insert(payload.slice(i,i+200));if(insertError)throw insertError;} $('academicCsvPreview').insertAdjacentHTML('afterbegin',`<div class="success-note">Successfully imported ${payload.length} records. Unmatched and ambiguous rows were not imported.</div>`);window.__wavesAcademicImport=[];await list();}
          catch(err){button.disabled=false;button.textContent=`Retry import`;$('academicCsvPreview').insertAdjacentHTML('afterbegin',`<div class="notice">Import stopped: ${esc(err.message)}. If earlier batches succeeded, review records before retrying to avoid duplicates.</div>`);}
        });
      }catch(err){$('academicCsvPreview').innerHTML=`<div class="notice">CSV preview failed: ${esc(err.message)}</div>`;}
    };
    drawAcademicStudentSearch('');
    await list();
  }

  // NOTICES
  async function notices() {
    const { data, error } = await db
      .from('notices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    view.innerHTML = `
      <h2>Notices & coaching updates</h2>

      <form id="noticeForm">
        <label>
          Notice title
          <input name="title" required maxlength="150">
        </label>

        <label>
          Message
          <textarea name="body" required></textarea>
        </label>

        <label>
          Category
          <select name="category">
            <option>General</option>
            <option>Fees</option>
            <option>Trip / Event</option>
            <option>Classes</option>
            <option>Exam</option>
          </select>
        </label>

        <button type="submit">Publish notice</button>
        <p id="noticeMsg" class="message"></p>
      </form>

      <h2>Previous notices</h2>
      <div id="noticeList"></div>
    `;

    $('noticeForm').onsubmit = async e => {
      e.preventDefault();

      const f = new FormData(e.target);
      const submitButton = e.target.querySelector('button[type="submit"]');
      submitButton.disabled = true;

      try {
        const { error: insertError } = await db
          .from('notices')
          .insert({
            title: f.get('title').trim(),
            body: f.get('body').trim(),
            category: f.get('category'),
            created_by: user.id,
            is_published: true
          });

        if (insertError) {
          $('noticeMsg').textContent =
            'The notice could not be published: ' + insertError.message;
          return;
        }

        $('noticeMsg').textContent = 'The notice was published successfully.';
        e.target.reset();

        await list();
      } catch (err) {
        $('noticeMsg').textContent = 'The notice list could not be loaded: ' + err.message;
      } finally {
        submitButton.disabled = false;
      }
    };

    async function list() {
      const { data: rows, error: listError } = await db
        .from('notices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (listError) throw listError;

      $('noticeList').innerHTML = rows.length
        ? rows.map(n => `
            <article class="item">
              <h3>${esc(n.title)}</h3>

              <small>
                ${esc(n.category)} ·
                ${esc(new Date(n.created_at).toLocaleString())}
              </small>

              <p>${esc(n.body)}</p>

              <p class="muted">
                Status: ${n.is_published ? 'Published' : 'Unpublished'}
              </p>

              <button
                class="secondary toggle-notice"
                data-id="${esc(n.id)}"
                data-state="${n.is_published}"
              >
                ${n.is_published ? 'Unpublish notice' : 'Publish notice'}
              </button>

              <button
                class="danger delete-notice"
                data-id="${esc(n.id)}"
              >
                Delete
              </button>
            </article>
          `).join('')
        : '<div class="empty">There are no notices yet.</div>';

      document.querySelectorAll('.toggle-notice').forEach(button => {
        button.onclick = async () => {
          const nextState = button.dataset.state !== 'true';

          const { error: updateError } = await db
            .from('notices')
            .update({ is_published: nextState })
            .eq('id', button.dataset.id);

          if (updateError) {
            alert('The notice could not be updated: ' + updateError.message);
            return;
          }

          await list();
        };
      });

      document.querySelectorAll('.delete-notice').forEach(button => {
        button.onclick = async () => {
          if (!confirm('Are you sure you want to delete this notice?')) {
            return;
          }

          const { error: deleteError } = await db
            .from('notices')
            .delete()
            .eq('id', button.dataset.id);

          if (deleteError) {
            alert('The notice could not be deleted: ' + deleteError.message);
            return;
          }

          await list();
        };
      });
    }

    await list();
  }

  // STUDENT DASHBOARD NOTICES
  function noticeCards(rows) {
    return rows.length
      ? rows.map(n => `
          <article class="item">
            <h3>${esc(n.title)}</h3>

            <small>
              ${esc(n.category)} ·
              ${esc(new Date(n.created_at).toLocaleString())}
            </small>

            <p>${esc(n.body)}</p>
          </article>
        `).join('')
      : '<div class="empty">There are no notices yet.</div>';
  }

async function studentNotices() {
  const { data, error } = await db
    .from('notices')
    .select('id, title, category, body, created_at')
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  if (error) throw error;

  view.innerHTML = `
    <h2>Notices</h2>
    ${noticeCards(data || [])}
  `;
}

  // STUDENT: MY FEES
  async function myfees() {
    const { data: student, error: studentError } = await db
      .from('students')
      .select('id,total_fees')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (studentError) throw studentError;

    if (!student) {
      view.innerHTML = `
        <div class="notice">
          Your student record is not linked to your account yet.
          Please contact the admin.
        </div>
      `;
      return;
    }

    const { data: payments, error: paymentError } = await db
      .from('fee_payments')
      .select('amount,payment_method,paid_at')
      .eq('student_id', student.id)
      .order('paid_at', { ascending: false });

    if (paymentError) throw paymentError;

    const paid = payments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );

    view.innerHTML = `
      <h2>My fees</h2>

      <div class="grid">
        <div class="stat">
          Total fees
          <strong>${money(student.total_fees)}</strong>
        </div>

        <div class="stat">
          Paid
          <strong>${money(paid)}</strong>
        </div>

        <div class="stat">
          Pending
          <strong>
            ${money(Math.max(0, Number(student.total_fees || 0) - paid))}
          </strong>
        </div>
      </div>

      <h2>Payment history</h2>

      ${
        payments.length
          ? `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${payments.map(p => `
                    <tr>
                      <td>${money(p.amount)}</td>
                      <td>${esc(p.payment_method || '—')}</td>
                      <td>
                        ${esc(
                          p.paid_at
                            ? new Date(p.paid_at).toLocaleString()
                            : '—'
                        )}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `
          : '<div class="empty">There is no payment history yet.</div>'
      }
    `;
  }

  // STUDENT: MY ACADEMIC RECORDS — scoped to the authenticated student's linked row.
  async function myacademics() {
    const {data:student,error:studentError}=await db.from('students').select('id,full_name,student_code,batch').eq('user_id',user.id).eq('is_active',true).maybeSingle();
    if(studentError)throw studentError;
    if(!student){view.innerHTML='<div class="notice">Your student record is not linked to your account yet. Please contact the admin.</div>';return;}
    const {data:records,error:recordsError}=await db.from('academic_records').select('*').eq('student_id',student.id).order('created_at',{ascending:false});
    if(recordsError)throw recordsError;
    const rows=records||[];const total=rows.length;const average=total?rows.reduce((sum,a)=>sum+(Number(a.max_marks)>0?Number(a.marks_obtained)/Number(a.max_marks)*100:0),0)/total:0;
    const subjects=[...new Set(rows.map(a=>a.subject).filter(Boolean))];
    view.innerHTML=`<div class="student-academic-header"><p class="section-kicker">PERSONAL PERFORMANCE REPORT</p><h2>My Academic Records</h2><p>Welcome, ${esc(student.full_name)}. Your learning progress, organized in one place.</p><div class="student-academic-meta"><span>${esc(student.student_code||'Student')}</span><span>${esc(student.batch||'WAVES CLASSES')}</span></div></div>
      <div class="academic-summary-grid"><article class="academic-summary-card"><small>Recorded assessments</small><strong>${total}</strong><span>Exams &amp; tests</span></article><article class="academic-summary-card"><small>Average score</small><strong>${total?average.toFixed(1)+'%':'—'}</strong><span>Across recorded subjects</span></article><article class="academic-summary-card"><small>Subjects tracked</small><strong>${subjects.length}</strong><span>With available records</span></article></div>
      <div class="student-records-heading"><div><p class="section-kicker">YOUR LEARNING JOURNEY</p><h3>Assessment history</h3></div><span class="badge">Private student view</span></div>
      ${total?`<div class="student-record-list">${rows.map(a=>{const pct=Number(a.max_marks)>0?Math.max(0,Math.min(100,Number(a.marks_obtained)/Number(a.max_marks)*100)):0;return `<article class="student-record-card"><div class="student-record-top"><div><span class="record-subject-tag">${esc(a.subject)}</span><h3>${esc(a.exam_name)}</h3><small>${esc(new Date(a.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}))}</small></div><div class="record-score"><strong>${pct.toFixed(1)}%</strong><span>${esc(a.marks_obtained)} / ${esc(a.max_marks)}</span></div></div><div class="record-progress"><span style="width:${pct}%"></span></div>${a.remarks?`<p class="record-remarks">${esc(a.remarks)}</p>`:''}</article>`;}).join('')}</div>`:'<div class="empty">Your academic records will appear here once they are added by the institute.</div>'}`;
  }

  // OWNER: WEBSITE PUBLICATION CONTROL
  async function publish() {
    if (profile.role !== 'owner') {
      view.innerHTML = `
        <div class="notice">
          Only the Owner can change website publication settings.
        </div>
      `;
      return;
    }

    const { data: settings, error } = await db
      .from('site_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;

    if (!settings) {
      view.innerHTML = `
        <div class="notice">
          The site settings record was not found. In Supabase, check the site_settings
          table and the record with id = 1.
        </div>
      `;
      return;
    }

    const isPublished = settings.is_published !== false;

    // Keep the header badge in sync (it was only updated from the Home tab,
    // so it showed the old status after toggling here).
    $('siteBadge').textContent = isPublished
      ? 'Website published'
      : 'Website unpublished';

    view.innerHTML = `
      <h2>Website publication control</h2>

      <div class="item">
        <p>
          Current status:
          <strong>${isPublished ? 'Published' : 'Unpublished'}</strong>
        </p>

        <p class="muted">
          Note: This changes the database status. On static hosting,
          separate hosting-level controls are required to make the website fully private or take it offline.
          hosting/server-side control chahiye.
        </p>

        <button
          id="publishToggle"
          class="${isPublished ? 'danger' : ''}"
        >
          ${isPublished ? 'Unpublish website' : 'Publish website'}
        </button>

        <p id="publishMsg" class="message"></p>
      </div>
    `;

    $('publishToggle').onclick = async () => {
      const nextState = !isPublished;

      if (
        !confirm(
          `Are you sure you want to website ko ${nextState ? 'publish' : 'unpublish'} the website?`
        )
      ) {
        return;
      }

      const { error: updateError } = await db
        .from('site_settings')
        .update({
          is_published: nextState,
          updated_by: user.id
        })
        .eq('id', 1);

      if (updateError) {
        $('publishMsg').textContent =
          'The website status could not be updated: ' + updateError.message;
        return;
      }

      await publish();
    };
  }

  // START APPLICATION — reliable loading-screen handling
  function hideLoadingScreen() {
    const loader = $('loadingScreen');
    if (!loader) return;

    loader.classList.add('loader-finished');
    loader.setAttribute('aria-hidden', 'true');

    // Remove it from the page after the CSS fade-out completes.
    window.setTimeout(() => {
      loader.style.display = 'none';
    }, 700);
  }

  async function startApplication() {
    try {
      // The public website must remain usable even before Supabase is configured.
      if (!db) {
        if (publicHome) publicHome.classList.remove('hidden');
        if (authPanel) authPanel.classList.add('hidden');
        if (appPanel) appPanel.classList.add('hidden');
        return;
      }

      await boot();

      // No active session: show the public website, not the login/dashboard.
      const { data: { session } = {}, error } = await db.auth.getSession();
      if (error) throw error;

      if (!session) {
        if (publicHome) publicHome.classList.remove('hidden');
        if (authPanel) authPanel.classList.add('hidden');
        if (appPanel) appPanel.classList.add('hidden');
      }
    } catch (error) {
      console.error('WAVES CLASSES startup error:', error);

      // A startup/auth failure must not leave the visitor trapped behind the loader.
      if (publicHome) publicHome.classList.remove('hidden');
      if (authPanel) authPanel.classList.add('hidden');
      if (appPanel) appPanel.classList.add('hidden');

      const setupNotice = $('setupNotice');
      if (setupNotice) {
        setupNotice.classList.remove('hidden');
        setupNotice.textContent =
          'There was a problem starting the website. Refresh the page and check the browser console if the issue persists.';
      }
    } finally {
      hideLoadingScreen();
    }
  }

  startApplication();
})();