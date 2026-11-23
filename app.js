// ==========================================
//   00. IMPORTACIONES Y CONFIGURACIÓN FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBLFDouWjE6-qNFvVJSR1BkL9ohuLZTpSs",
  authDomain: "pizarrapostits.firebaseapp.com",
  projectId: "pizarrapostits",
  storageBucket: "pizarrapostits.firebasestorage.app",
  messagingSenderId: "68870766665",
  appId: "1:68870766665:web:2b1a0c30d0c52864087f98"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });
const notesCollection = collection(db, "postits");

// ==========================================
//   REFERENCIAS AL DOM Y ESTADO GLOBAL
// ==========================================
const loginScreen = document.getElementById("login-screen");
const btnLoginGoogle = document.getElementById("btn-login-google");
const btnLogout = document.getElementById("btn-logout");
const board = document.getElementById("board");
const fab = document.getElementById("fab");
const noteModal = document.getElementById("note-modal");
const confirmModal = document.getElementById("confirm-modal");
const noteText = document.getElementById("note-text");
const btnSaveNote = document.getElementById("btn-save-note");
const btnCancelNote = document.getElementById("btn-cancel-note");
const btnConfirmDelete = document.getElementById("btn-confirm-delete");
const btnCancelDelete = document.getElementById("btn-cancel-delete");
const colorButtons = document.querySelectorAll(".color-btn");

let editingNoteId = null;
let selectedColor = "#fff59d";
let pendingDeleteId = null;
let pendingDeleteElement = null;
let unsubscribeNotes = null;

// ==========================================
//   01. AUTENTICACIÓN CON GOOGLE
// ==========================================
btnLoginGoogle?.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Error al iniciar sesión con Google:", error.code, error.message);
  }
});

btnLogout?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error al cerrar sesión:", error.code, error.message);
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.style.display = "none";
    board.classList.remove("hidden-board");
    fab.classList.remove("hidden");
    btnLogout?.classList.remove("hidden");

    board.replaceChildren();
    iniciarEscuchaNotas(user.uid);
  } else {
    loginScreen.style.display = "flex";
    board.classList.add("hidden-board");
    fab.classList.add("hidden");
    btnLogout?.classList.add("hidden");
    board.replaceChildren();

    if (unsubscribeNotes) {
      unsubscribeNotes();
      unsubscribeNotes = null;
    }
  }
});

// ==========================================
//   02. MODALES Y CREACIÓN / EDICIÓN (CREATE & UPDATE)
// ==========================================
colorButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    colorButtons.forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedColor = btn.dataset.color;
  });
});

fab.addEventListener("click", () => {
  editingNoteId = null;
  document.getElementById("modal-title").innerText = "Nueva Nota";
  noteText.value = "";
  noteModal.classList.remove("hidden");
});

btnCancelNote.addEventListener("click", () => {
  noteModal.classList.add("hidden");
});

btnSaveNote.addEventListener("click", async () => {
  const text = noteText.value.trim();
  if (!text || !auth.currentUser) return;

  if (editingNoteId) {
    const noteRef = doc(db, "postits", editingNoteId);
    await updateDoc(noteRef, { text, color: selectedColor });
  } else {
    const centerX = (window.innerWidth / 2) - 80;
    const centerY = (window.innerHeight / 2) - 80;

    await addDoc(notesCollection, {
      text: text,
      color: selectedColor,
      coordenadaX: centerX,
      coordenadaY: centerY,
      fechaCreacion: serverTimestamp(),
      userId: auth.currentUser.uid,
      creador: auth.currentUser.email || "Anónimo"
    });
  }

  noteModal.classList.add("hidden");
});

// ==========================================
//   03. SINCRONIZACIÓN EN TIEMPO REAL POR USUARIO (READ)
// ==========================================
function iniciarEscuchaNotas(userId) {
  if (unsubscribeNotes) {
    unsubscribeNotes();
  }

  const userNotesQuery = query(notesCollection, where("userId", "==", userId));

  unsubscribeNotes = onSnapshot(userNotesQuery, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const id = change.doc.id;
      const data = change.doc.data();
      const existingNote = document.getElementById(`note-${id}`);

      if (change.type === "added") {
        if (!existingNote) {
          board.appendChild(createNoteElement(id, data));
        }
      }

      if (change.type === "modified") {
        if (existingNote) {
          const freshNote = createNoteElement(id, data);
          existingNote.replaceWith(freshNote);
        } else {
          board.appendChild(createNoteElement(id, data));
        }
      }

      if (change.type === "removed") {
        if (existingNote) {
          existingNote.remove();
        }
      }
    });
  });
}

function createNoteElement(id, data) {
  const div = document.createElement("div");
  div.className = "postit";
  div.id = `note-${id}`;
  div.innerText = data.text;
  div.style.backgroundColor = data.color;
  div.style.left = `${data.coordenadaX}px`;
  div.style.top = `${data.coordenadaY}px`;
  div.dataset.id = id;

  attachTouchController(div, data);
  return div;
}

// ==========================================
//   04. CONTROLADOR DE GESTOS TÁCTILES Y RATÓN
// ==========================================
function attachTouchController(element, data) {
  let startX = 0, startY = 0;
  let initialX = data.coordenadaX;
  let initialY = data.coordenadaY;

  let currentDeltaX = 0;
  let isDragging = false;
  let isSwiping = false;
  let lastTapTime = 0;

  // --- Controles de ordenador (ratón) ---
  element.addEventListener("dblclick", (e) => {
    e.preventDefault();
    openEditModal(element.dataset.id, element.innerText, data.color);
  });

  element.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    promptDelete(element.dataset.id, element);
  });

  element.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;

    e.preventDefault();
    const mouseStartX = e.clientX;
    const mouseStartY = e.clientY;
    const mouseInitialX = parseFloat(element.style.left) || 0;
    const mouseInitialY = parseFloat(element.style.top) || 0;
    let mouseDragging = false;

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - mouseStartX;
      const dy = moveEvent.clientY - mouseStartY;

      if (!mouseDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        mouseDragging = true;
      }

      if (mouseDragging) {
        element.style.left = `${mouseInitialX + dx}px`;
        element.style.top = `${mouseInitialY + dy}px`;
      }
    };

    const onMouseUp = async () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      if (mouseDragging) {
        const finalX = parseFloat(element.style.left);
        const finalY = parseFloat(element.style.top);

        const noteRef = doc(db, "postits", element.dataset.id);
        await updateDoc(noteRef, {
          coordenadaX: finalX,
          coordenadaY: finalY
        });
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  // --- Controles táctiles (móvil / tablet) ---
  element.addEventListener("touchstart", (e) => {
    if (e.touches.length > 1) return;

    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;

    initialX = parseFloat(element.style.left) || 0;
    initialY = parseFloat(element.style.top) || 0;

    currentDeltaX = 0;
    isDragging = false;
    isSwiping = false;

    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapTime;

    if (tapLength < 300 && tapLength > 0) {
      e.preventDefault();
      openEditModal(element.dataset.id, element.innerText, data.color);
      lastTapTime = 0;
      return;
    }
    lastTapTime = currentTime;
  }, { passive: false });

  element.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1) return;
    const touch = e.touches[0];

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    if (!isDragging && !isSwiping) {
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        isSwiping = true;
      } else if (Math.abs(deltaY) > 10 || Math.abs(deltaX) > 10) {
        isDragging = true;
      }
    }

    if (isSwiping) {
      e.preventDefault();
      currentDeltaX = deltaX;
      const rotation = deltaX * 0.1;
      element.style.transform = `translate(${deltaX}px, 0px) rotate(${rotation}deg)`;
    } else if (isDragging) {
      e.preventDefault();
      const newX = initialX + deltaX;
      const newY = initialY + deltaY;

      element.style.left = `${newX}px`;
      element.style.top = `${newY}px`;
    }
  }, { passive: false });

  element.addEventListener("touchend", async () => {
    if (isSwiping) {
      if (Math.abs(currentDeltaX) > 100) {
        promptDelete(element.dataset.id, element);
      } else {
        resetNoteTransform(element);
      }
      isSwiping = false;
      return;
    }

    if (isDragging) {
      isDragging = false;
      const finalX = parseFloat(element.style.left);
      const finalY = parseFloat(element.style.top);

      const noteRef = doc(db, "postits", element.dataset.id);
      await updateDoc(noteRef, {
        coordenadaX: finalX,
        coordenadaY: finalY
      });
    }
  });
}

function resetNoteTransform(element) {
  element.classList.add("resetting");
  element.style.transform = "translate(0, 0) rotate(0deg)";
  setTimeout(() => {
    element.classList.remove("resetting");
  }, 300);
}

// ==========================================
//   05. FLUJO DE BORRADO (DELETE) Y EDICIÓN
// ==========================================
function promptDelete(id, element) {
  pendingDeleteId = id;
  pendingDeleteElement = element;
  confirmModal.classList.remove("hidden");
}

btnConfirmDelete.addEventListener("click", async () => {
  if (pendingDeleteId) {
    const noteRef = doc(db, "postits", pendingDeleteId);
    await deleteDoc(noteRef);

    if (pendingDeleteElement) {
      pendingDeleteElement.remove();
    }

    pendingDeleteId = null;
    pendingDeleteElement = null;
  }
  confirmModal.classList.add("hidden");
});

btnCancelDelete.addEventListener("click", () => {
  if (pendingDeleteElement) {
    resetNoteTransform(pendingDeleteElement);
  }
  pendingDeleteId = null;
  pendingDeleteElement = null;
  confirmModal.classList.add("hidden");
});

function openEditModal(id, currentText, currentColor) {
  editingNoteId = id;
  document.getElementById("modal-title").innerText = "Editar Nota";
  noteText.value = currentText;
  selectedColor = currentColor;

  colorButtons.forEach(b => {
    b.classList.toggle("selected", b.dataset.color === currentColor);
  });

  noteModal.classList.remove("hidden");
}