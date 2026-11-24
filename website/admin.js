
const $ = id => document.getElementById(id);

// ESCORE SUPER ADMIN
const ADMIN_UID = "GG2xiZf0wngznA1LaeeZQCfEhWW2";

const fields = [
  'type', 'region', 'event', 'title',
  'date', 'body', 'source', 'image', 'published'
];

let editing = null;
let unsubscribe = null;
let adminVerified = false;

const status = message => {
  if ($('status')) {
    $('status').textContent = message;
  }
};

// RESET EDITOR
function reset() {
  editing = null;

  const editor = $('editor');

  if (editor instanceof HTMLFormElement) {
    HTMLFormElement.prototype.reset.call(editor);
  } else {
    fields.forEach(field => {
      const el = $(field);

      if (!el) return;

      if (el.tagName === 'SELECT') {
        el.selectedIndex = 0;
      } else {
        el.value = '';
      }
    });
  }

  if ($('date')) {
    $('date').value = new Date()
      .toISOString()
      .slice(0, 10);
  }
}

// INITIALIZATION
async function init() {

  if (!window.ESCORE_CONFIG?.projectId) {
    status('Firebase configuration missing.');
    return;
  }

  if (typeof firebase === 'undefined') {
    status('Firebase SDK not loaded.');
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(window.ESCORE_CONFIG);
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const col = db.collection('content');

  console.log('ESCORE ADMIN V4 — DIRECT UID');
  console.log('PROJECT:', firebase.app().options.projectId);

  if ($('reset')) {
    $('reset').onclick = e => {
      e.preventDefault();
      reset();
    };
  }

  reset();

  // CHECK ADMIN SESSION
  function isAdmin() {
    return adminVerified &&
      auth.currentUser?.uid === ADMIN_UID;
  }

  // LOGIN
  $('login').onsubmit = async e => {

    e.preventDefault();

    const email = $('email').value.trim();
    const password = $('password').value;
    const button = $('login').querySelector('button');

    if (!email || !password) {
      status('Email and password required.');
      return;
    }

    try {

      if (button) button.disabled = true;

      status('Connecting to ESCORE...');

      await auth.setPersistence(
        firebase.auth.Auth.Persistence.LOCAL
      );

      const result =
        await auth.signInWithEmailAndPassword(
          email,
          password
        );

      console.log('AUTH SUCCESS:', result.user.uid);

    } catch (error) {

      console.error('LOGIN ERROR:', error);

      if (
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/user-not-found' ||
        error.message.includes('INVALID_LOGIN_CREDENTIALS')
      ) {
        status('Email ou mot de passe incorrect.');
      } else {
        status('Login error: ' + error.message);
      }

    } finally {

      if (button) button.disabled = false;
    }
  };

  // LOGOUT
  $('logout').onclick = async e => {

    e.preventDefault();

    try {

      adminVerified = false;

      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }

      await auth.signOut();

      reset();

      status('Disconnected.');

    } catch (error) {

      status(error.message);
    }
  };

  // ADMIN VERIFICATION — DIRECT UID
  auth.onAuthStateChanged(async user => {

    adminVerified = false;

    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    $('dashboard').classList.add('hidden');
    $('logout').classList.add('hidden');
    $('login').classList.remove('hidden');
    $('items').replaceChildren();

    if (!user) return;

    try {

      status('Checking admin permissions...');

      console.log('CONNECTED UID:', user.uid);
      console.log('EXPECTED UID:', ADMIN_UID);

      // NO FIRESTORE ADMIN COLLECTION REQUIRED
      if (user.uid !== ADMIN_UID) {

        console.error('UID MISMATCH');

        await auth.signOut();

        status('Access denied: Unauthorized account.');

        return;
      }

      if (auth.currentUser?.uid !== ADMIN_UID) {
        return;
      }

      // AUTHORIZED ADMIN
      adminVerified = true;

      $('dashboard').classList.remove('hidden');
      $('logout').classList.remove('hidden');
      $('login').classList.add('hidden');

      status('ESCORE Admin — Connected');

      console.log('ADMIN ACCESS GRANTED');

      // LOAD CONTENT
      unsubscribe = col.onSnapshot(snapshot => {

        if (!isAdmin()) return;

        $('items').replaceChildren();

        snapshot.docs.forEach(doc => {

          const x = doc.data();

          const article =
            document.createElement('article');

          article.className = 'item';

          const title =
            document.createElement('h3');

          title.textContent = x.title;

          const info =
            document.createElement('p');

          info.textContent =
            x.type + ' • ' +
            (x.published ? 'Published' : 'Draft');

          // EDIT BUTTON
          const edit =
            document.createElement('button');

          edit.textContent = 'Edit';
          edit.type = 'button';

          edit.onclick = () => {

            if (!isAdmin()) return;

            editing = doc.id;

            fields.forEach(field => {

              if ($(field)) {
                $(field).value =
                  String(x[field] ?? '');
              }

            });

            $('editor').scrollIntoView({
              behavior: 'smooth'
            });
          };

          // DELETE BUTTON
          const del =
            document.createElement('button');

          del.className = 'danger';
          del.textContent = 'Delete';
          del.type = 'button';

          del.onclick = async () => {

            if (!isAdmin()) return;

            if (!confirm(
              'Delete this entry permanently?'
            )) return;

            try {

              await doc.ref.delete();

              status('Deleted successfully.');

            } catch (error) {

              console.error('DELETE ERROR:', error);

              status(error.message);
            }
          };

          article.append(
            title,
            info,
            edit,
            document.createTextNode(' '),
            del
          );

          $('items').append(article);

        });

        console.log('CONTENT LOADED:', snapshot.size);

      }, error => {

        console.error('CONTENT ERROR:', error);

        status(
          'Firestore content error: ' + error.message
        );
      });

    } catch (error) {

      adminVerified = false;

      console.error('ADMIN ERROR:', error);

      status(error.message);
    }
  });

  // CONTENT EDITOR
  const editor = $('editor');

  const editorForm =
    editor instanceof HTMLFormElement
      ? editor
      : editor?.querySelector('form') ||
        editor?.closest('form');

  if (!editorForm) {
    console.error('EDITOR FORM NOT FOUND');
    return;
  }

  // SAVE CONTENT
  editorForm.onsubmit = async e => {

    e.preventDefault();

    if (!isAdmin()) {
      status('Admin access required.');
      return;
    }

    const x = {};

    for (const field of fields) {

      if (!$(field)) {
        status('Missing field: ' + field);
        return;
      }

      x[field] = $(field).value;
    }

    x.title = x.title.trim();
    x.source = x.source.trim();
    x.image = x.image.trim();

    x.published = x.published === 'true';

    if (!x.title || x.title.length > 160) {
      status('Title must contain 1 to 160 characters.');
      return;
    }

    if (x.body.length > 20000) {
      status('Article is too long.');
      return;
    }

    if (
      !x.source.startsWith('https://') ||
      (x.image && !x.image.startsWith('https://'))
    ) {
      status('Use HTTPS source and image URLs.');
      return;
    }

    x.updatedAt =
      firebase.firestore.FieldValue.serverTimestamp();

    try {

      status('Saving content...');

      if (editing) {

        await col.doc(editing).set(x);

      } else {

        await col.add(x);
      }

      reset();

      status('Saved successfully.');

      console.log('CONTENT SAVED');

    } catch (error) {

      console.error('SAVE ERROR:', error);

      status('Save error: ' + error.message);
    }
  };
}

// SAFE INITIALIZATION
if (document.readyState === 'loading') {

  document.addEventListener(
    'DOMContentLoaded',
    init
  );

} else {

  init();
}
