
import { auth, db, storage } from "./firebase.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  serverTimestamp,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const form = document.getElementById("requestForm");
const status = document.getElementById("status");
const listDiv = document.getElementById("requestsList");

let unsubscribe = null; // important for real-time fix
window.activeChatId = null;//this is changed 

// ==========================
// POST REQUEST
// ==========================
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const user = auth.currentUser;
  if (!user) return alert("Login first");

  const trainNo = document.getElementById("trainNo").value;
  const pnr = document.getElementById("pnr").value;
  const seat = document.getElementById("seat").value;
  const berth = document.getElementById("berth").value;
  const from = document.getElementById("from").value;
  const to = document.getElementById("to").value;
  const preferred = document.getElementById("preferred").value;
  const file = document.getElementById("photo").files[0];

  let photoUrl = null;

  try {
    // Upload photo if exists
    if (file) {
      const fileRef = ref(storage, `users/${user.uid}/tickets/${Date.now()}.jpg`);
      await uploadBytes(fileRef, file);
      photoUrl = await getDownloadURL(fileRef);
    }

    // Save request
    await addDoc(collection(db, "requests"), {
      uid: user.uid,
      trainNo,
      pnr,
      seatNumber: seat,
      berthType: berth,
      fromStation: from.toUpperCase(),
      toStation: to.toUpperCase(),
      preferredBerth: preferred,
      photoUrl,
      status: "open",
      createdAt: serverTimestamp()
    });

    // Automatically show matching requests
    loadRequests(trainNo);

    status.innerText = "Request posted successfully!";
    form.reset();

  } catch (err) {
    console.error(err);
    status.innerText = "Error posting request";
  }
});


// ==========================
// 🔍 MANUAL SEARCH FUNCTION
// ==========================
window.searchTrain = () => {
  console.log("Search clicked");  // 👈 ADD THIS

  const trainNo = document.getElementById("searchTrain").value.trim();

  console.log("Train number:", trainNo); // 👈 ADD THIS

  if (!trainNo) {
    alert("Please enter train number");
    return;
  }

  loadRequests(trainNo);
};


// ==========================
// 🔥 LOAD REQUESTS (REAL-TIME FIX)
// ==========================
function loadRequests(trainNo) {

  // 🔥 Stop previous listener (VERY IMPORTANT FIX)
  if (unsubscribe) unsubscribe();

  const q = query(
    collection(db, "requests"),
    where("trainNo", "==", trainNo),
    orderBy("createdAt", "desc")
  );

  unsubscribe = onSnapshot(q, (snapshot) => {

    listDiv.innerHTML = "";

    if (snapshot.empty) {
      listDiv.innerHTML = "<p>No matching requests yet</p>";
      return;
    }

    snapshot.forEach(docSnap => {
      const data = docSnap.data();

      if (!auth.currentUser) return;

      if (data.uid === auth.currentUser.uid) return;

      const card = document.createElement("div");
      card.className = "card";

      card.innerHTML = `
        <p><b>Train:</b> ${data.trainNo}</p>
        <p><b>PNR:</b> ${data.pnr}</p>
        <p><b>Seat:</b> ${data.seatNumber}</p>
        <p><b>Current Berth:</b> ${data.berthType}</p>
        <p><b>From:</b> ${data.fromStation}</p>
        <p><b>To:</b> ${data.toStation}</p>
        <p><b>Wants:</b> ${data.preferredBerth}</p>
        <button onclick="handleInterest(this, '${docSnap.id}', '${data.uid}')">
          Interested
        </button>
      `;

      listDiv.appendChild(card);
    });

  });
}


// ==========================
// 🤝 INTEREST FUNCTION
// ==========================
window.sendInterest = async (requestId, ownerUid) => {
  const user = auth.currentUser;
  if (!ownerUid) {
    console.error("ownerUid missing:", ownerUid);
    alert("Error: Invalid user");
    return;
  }

  if (!user.uid) {
    console.error("user uid missing");
    return;
  }

  console.log("Creating match with:", user.uid, ownerUid);
  if (!user) return alert("Login first");

  const chatId = [user.uid, ownerUid].sort().join("_");

  try {
    const matchRef = doc(db, "matches", chatId);

    const existing = await getDoc(matchRef);

    if (existing.exists()) {

      await setDoc(matchRef, {
        status: "matched"
      }, { merge: true });

      const pnrMap = existing.data().pnrMap;

      const otherPNR = pnrMap[ownerUid];

      openChat(chatId, otherPNR);

      alert("Match found! Chat enabled 🚀");
      return;
    }

    let myPNR = "Unknown";
    let trainNo = "";

    // first getting trainNo from clicked request
    const clickedReqRef = doc(db, "requests", requestId);
    const clickedSnap = await getDoc(clickedReqRef);

    if (clickedSnap.exists()) {
      trainNo = clickedSnap.data().trainNo;
    }

    // now find YOUR request for same train
    const myQuery = query(
      collection(db, "requests"),
      where("uid", "==", user.uid),
      where("trainNo", "==", trainNo)
    );

    const mySnap = await getDocs(myQuery);

    mySnap.forEach(doc => {
      myPNR = doc.data().pnr;
    });

    //  GET OTHER USER PNR 
    let otherPNR = "Unknown";

    if (clickedSnap.exists()) {
      otherPNR = clickedSnap.data().pnr;
    }

    console.log("Creating match with:", user.uid, ownerUid);

    if (!user.uid || !ownerUid) {
      console.error("Invalid users:", user.uid, ownerUid);
      alert("Error: Invalid user data");
      return;
    }
    //CREATE MATCH WITH BOTH PNRs
    await setDoc(matchRef, {
      users: [user.uid, ownerUid],
      createdAt: serverTimestamp(),
      status: "pending",
      trainNo: trainNo,
      pnrMap: {
        [user.uid]: myPNR,
        [ownerUid]: otherPNR
      }
    });

    openChat(chatId, otherPNR);

    alert("Interest sent successfully!");

  } catch (err) {
    console.error(err);
    alert("Error sending interest");
  }
};

//Helper Function
window.handleInterest = async (btn, requestId, ownerUid) => {
  btn.innerText = "Sending...";
  btn.disabled = true;

  await sendInterest(requestId, ownerUid);

  btn.innerText = "Interested ✓";
};

// ==========================
// 💬 SEND MESSAGE
// ==========================
window.sendMessage = async () => {
  const user = auth.currentUser;
  const input = document.getElementById("messageInput");
  const text = input.value;

  const matchId = window.activeChatId; // 🔥 THIS IS THE FIX

  console.log("DEBUG:", {
    text,
    user,
    matchId
  });

  if (!text || !user || !matchId) {
    alert("Missing data");
    return;
  }

  try {
    await addDoc(
      collection(db, "chats", matchId, "messages"),
      {
        text: text,
        senderId: user.uid,
        createdAt: serverTimestamp()
      }
    );

    input.value = "";

  } catch (err) {
    console.error(err);
    alert("Error sending message");
  }
};

function listenToMessages(chatId) {

  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt")
  );

  onSnapshot(q, (snapshot) => {

    const chatDiv = document.getElementById("chatMessages");
    chatDiv.innerHTML = "";

    const user = auth.currentUser;
    if (!user) return;

    snapshot.forEach(doc => {
      const msg = doc.data();

      const messageDiv = document.createElement("div");

      //  LEFT / RIGHT logic
      if (msg.senderId === user.uid) {
        messageDiv.className = "my-message";
      } else {
        messageDiv.className = "other-message";
      }

      messageDiv.innerHTML = `
        <div>${msg.text}</div>
        <small>${msg.createdAt?.toDate().toLocaleTimeString()}</small>
      `;

      chatDiv.appendChild(messageDiv);
    });

    chatDiv.scrollTop = chatDiv.scrollHeight;
  });
}

window.closeChat = async () => {
  if (!window.activeChatId) return;

  try {
    const matchRef = doc(db, "matches", activeChatId);

    await setDoc(matchRef, {
      status: "closed"
    }, { merge: true });

    document.getElementById("chatBox").style.display = "none";
    document.getElementById("chatListBox").style.display = "block";
    document.getElementById("feedbackBox").style.display = "block";

    alert("Chat closed");

  } catch (err) {
    console.error(err);
    alert("Error closing chat");
  }
};

window.openChat = (chatId, pnr) => {
  window.activeChatId = chatId;

  // 🔥 hide chat list
  document.getElementById("chatListBox").style.display = "none";

  // 🔥 show chat box
  document.getElementById("chatBox").style.display = "block";

  document.getElementById("chatTitle").innerText =
    "Chat with PNR " + pnr;

  listenToMessages(chatId);
};

// sumbit feedback function
window.submitFeedback = async () => {
  const user = auth.currentUser;
  const rating = document.getElementById("rating").value;
  const comment = document.getElementById("comment").value;
  const matchId = window.activeChatId;

  if (!user || !matchId) {
    alert("Error submitting feedback");
    return;
  }

  try {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await getDoc(matchRef);

    const users = matchSnap.data().users;

    const otherUser = users.find(u => u !== user.uid);

    await addDoc(collection(db, "feedbacks"), {
      fromUserId: user.uid,
      toUserId: otherUser,
      rating: Number(rating),
      comment: comment,
      matchId: matchId,
      createdAt: serverTimestamp()
    });

    alert("Thank you for you rating!");

    document.getElementById("feedbackBox").style.display = "none";

  } catch (err) {
    console.error(err);
    alert("Error submitting feedback");
  }
};