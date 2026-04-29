import { auth, provider, db } from "./firebase.js";

import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const form = document.getElementById("requestForm");
const welcome = document.getElementById("welcome");

loginBtn.onclick = () => signInWithPopup(auth, provider);
logoutBtn.onclick = () => signOut(auth);

// ==========================
// 🔥 AUTH STATE + CHAT ENABLE
// ==========================
onAuthStateChanged(auth, user => {

  if (user) {
    // UI updates
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    form.style.display = "block";
    welcome.innerText = `Welcome ${user.displayName}`;

    // ==========================
    // 🔥 CHECK MATCHES FOR CHAT
    // ==========================
    const q = query(
      collection(db, "matches"),
      where("users", "array-contains", user.uid)
    );

    onSnapshot(q, async (snapshot) => {

      const chatListBox = document.getElementById("chatListBox");
      const chatList = document.getElementById("chatList");

      chatList.innerHTML = "";

      if (snapshot.empty) {
        if (chatListBox) chatListBox.style.display = "none";
        return;
      }

      let hasChats = false;

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();

        if (data.users && data.users.includes(user.uid) && data.status === "matched") {

          hasChats = true;

          // 🔥 FIND OTHER USER
          const otherUser = data.users.find(uid => uid !== user.uid);

          // 🔥 GET ALL REQUESTS OF THIS MATCH
          let pnr = "Unknown";

          const requestsQuery = query(
            collection(db, "requests"),
            where("uid", "==", otherUser)
          );

          const requestsSnap = await getDocs(requestsQuery);

          requestsSnap.forEach(doc => {
            const reqData = doc.data();

            if (reqData.trainNo === data.trainNo) {
              pnr = reqData.pnr;
            }
          });

          // 🔥 CREATE CHAT ITEM
          const div = document.createElement("div");
          div.className = "chat-item";
          div.innerText = "Chat with PNR: " + pnr;

          div.onclick = () => {
            openChat(docSnap.id, pnr);
          };

          chatList.appendChild(div);
        }
      }

      if (hasChats) {
        chatListBox.style.display = "block";
      } else {
        chatListBox.style.display = "none";
      }

    });

  } else {
    // UI reset
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    form.style.display = "none";
    welcome.innerText = "";

    // hide chat on logout
    const chatBox = document.getElementById("chatBox");
    if (chatBox) {
      chatBox.style.display = "none";
    }
  }
});