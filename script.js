// ==========================================
// 1. SUPABASE CONFIGURATION & INITIALIZATION
// ==========================================
// Replace these with your actual Supabase project URL and Anon Public Key
const SUPABASE_URL = 'https://YOUR_SUPABASE_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Initialize Supabase client (assuming the Supabase CDN script is included in your HTML or loaded dynamically)
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State variables
let isAdmin = false;
const ONE_HOUR_MS = 60 * 60 * 1000;

// ==========================================
// 2. DOM LOAD & EVENT LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadVisitorCredentials();
  fetchMessages();

  // Form submission handler
  const form = document.getElementById('guestbookForm');
  form.addEventListener('submit', handlePostMessage);

  // Admin toggle & login handlers
  document.getElementById('adminToggleBtn').addEventListener('click', toggleAdminSection);
  document.getElementById('adminLoginSubmit').addEventListener('click', handleAdminLogin);
});

// ==========================================
// 3. LOCALSTORAGE & CREDENTIAL AUTOFILL
// ==========================================
function loadVisitorCredentials() {
  const savedName = localStorage.getItem('gb_visitor_name');
  const savedEmail = localStorage.getItem('gb_visitor_email');
  const savedWebsite = localStorage.getItem('gb_visitor_website');

  if (savedName) document.getElementById('gbName').value = savedName;
  if (savedEmail) document.getElementById('gbEmail').value = savedEmail;
  if (savedWebsite) document.getElementById('gbWebsite').value = savedWebsite;

  // If admin session is active in sessionStorage, restore admin state
  if (sessionStorage.getItem('gb_is_admin') === 'true') {
    enableAdminMode();
  }
}

function saveVisitorCredentials(name, email, website) {
  if (!isAdmin) {
    localStorage.setItem('gb_visitor_name', name);
    localStorage.setItem('gb_visitor_email', email);
    localStorage.setItem('gb_visitor_website', website);
  }
}

// ==========================================
// 4. ADMIN AUTHENTICATION & AUTOFILL
// ==========================================
function toggleAdminSection() {
  const adminSection = document.getElementById('adminLoginSection');
  if (adminSection.style.display === 'none') {
    adminSection.style.display = 'flex';
  } else {
    adminSection.style.display = 'none';
  }
}

async function handleAdminLogin() {
  const passwordInput = document.getElementById('adminPasswordInput').value;
  
  // Best practice: verify admin password securely via a Supabase Edge Function or RPC function.
  // For client-side setup demonstration, we query a secure admin table or verify hash:
  const { data, error } = await supabase.rpc('verify_admin_password', { input_password: passwordInput });

  if (error || !data) {
    alert('Invalid admin password!');
    return;
  }

  enableAdminMode();
  sessionStorage.setItem('gb_is_admin', 'true');
  document.getElementById('adminLoginSection').style.display = 'none';
  alert('Logged in as Admin successfully!');
  fetchMessages();
}

function enableAdminMode() {
  isAdmin = true;
  document.getElementById('adminToggleBtn').textContent = 'Admin Mode (Active)';
  document.getElementById('adminToggleBtn').style.color = 'green';

  // Autofill admin credentials if predefined
  document.getElementById('gbName').value = "Site Owner (Admin)";
  document.getElementById('gbEmail').value = "owner@yoursite.com";
  document.getElementById('gbWebsite').value = "https://yoursite.com";
}

// ==========================================
// 5. FETCH & RENDER MESSAGES & REPLIES
// ==========================================
async function fetchMessages() {
  const messagesContainer = document.getElementById('guestbookMessages');
  messagesContainer.innerHTML = '<p>Loading guestbook...</p>';

  // Fetch main messages (parent_id is null) along with their replies
  const { data: messages, error } = await supabase
    .from('guestbook')
    .select('*')
    .is('parent_id', null)
    .order('created_at', { ascending: false });

  if (error) {
    messagesContainer.innerHTML = '<p style="color:red;">Error loading messages.</p>';
    console.error(error);
    return;
  }

  if (messages.length === 0) {
    messagesContainer.innerHTML = '<p>No messages yet. Be the first to sign!</p>';
    return;
  }

  messagesContainer.innerHTML = '';
  for (const msg of messages) {
    const html = await renderMessageCard(msg);
    messagesContainer.innerHTML += html;
  }
}

async function renderMessageCard(msg) {
  const currentTime = new Date().getTime();
  const messageTime = new Date(msg.created_at).getTime();
  const timeElapsed = currentTime - messageTime;
  
  // Check visitor edit permission (within 1 hour) vs Admin override permission
  const isOwner = localStorage.getItem('gb_visitor_id') === msg.visitor_id;
  const canVisitorEdit = isOwner && (timeElapsed < ONE_HOUR_MS);
  const canEdit = isAdmin || canVisitorEdit;

  // Fetch replies for this message
  const { data: replies } = await supabase
    .from('guestbook')
    .select('*')
    .eq('parent_id', msg.id)
    .order('created_at', { ascending: true });

  let repliesHTML = '';
  if (replies && replies.length > 0) {
    replies.forEach(reply => {
      const replyTimeElapsed = currentTime - new Date(reply.created_at).getTime();
      const isReplyOwner = localStorage.getItem('gb_visitor_id') === reply.visitor_id;
      const canEditReply = isAdmin || (isReplyOwner && replyTimeElapsed < ONE_HOUR_MS);

      repliesHTML += `
        <div class="guestbook-reply" data-id="${reply.id}">
          <div class="gb-msg-header">
            <strong><a href="${escapeHTML(reply.website || '#')}" target="_blank">${escapeHTML(reply.name)}</a></strong>
            <span class="gb-time">${timeAgo(reply.created_at)}</span>
          </div>
          <p class="gb-content">${escapeHTML(reply.body)}</p>
          <div class="gb-actions">
            <button onclick="likeMessage('${reply.id}')">❤️ ${reply.likes || 0}</button>
            ${canEditReply ? `<button onclick="editMessagePrompt('${reply.id}', '${escapeQuotes(reply.body)}')">Edit</button>` : ''}
            ${isAdmin && !isReplyOwner ? `<button onclick="adminFixMessagePrompt('${reply.id}', '${escapeQuotes(reply.body)}')" style="color:orange;" title="Admin override">Admin Fix</button>` : ''}
          </div>
        </div>
      `;
    });
  }

  return `
    <div class="guestbook-message-card" data-id="${msg.id}">
      <div class="gb-msg-header">
        <strong><a href="${escapeHTML(msg.website || '#')}" target="_blank">${escapeHTML(msg.name)}</a></strong>
        <span class="gb-time">${timeAgo(msg.created_at)}</span>
      </div>
      <p class="gb-content">${escapeHTML(msg.body)}</p>
      
      <div class="gb-actions">
        <button onclick="likeMessage('${msg.id}')">❤️ ${msg.likes || 0}</button>
        <button onclick="toggleReplyBox('${msg.id}')">Reply</button>
        ${canEdit ? `<button onclick="editMessagePrompt('${msg.id}', '${escapeQuotes(msg.body)}')">Edit</button>` : ''}
        ${isAdmin && !isOwner ? `<button onclick="adminFixMessagePrompt('${msg.id}', '${escapeQuotes(msg.body)}')" style="color:orange;" title="Discouraged admin edit">Admin Fix</button>` : ''}
      </div>

      <!-- Hidden Reply Box -->
      <div id="reply-box-${msg.id}" class="gb-reply-box" style="display:none; margin-top: 10px;">
        <input type="text" id="reply-name-${msg.id}" placeholder="Your name *" value="${isAdmin ? 'Site Owner (Admin)' : (localStorage.getItem('gb_visitor_name') || '')}">
        <input type="email" id="reply-email-${msg.id}" placeholder="Email (confidential)">
        <input type="url" id="reply-website-${msg.id}" placeholder="Website URL" value="${isAdmin ? 'https://yoursite.com' : (localStorage.getItem('gb_visitor_website') || '')}">
        <textarea id="reply-body-${msg.id}" placeholder="Write a reply..."></textarea>
        <button onclick="submitReply('${msg.id}')">Post Reply</button>
      </div>

      <div class="gb-replies-container">
        ${repliesHTML}
      </div>
    </div>
  `;
}

// ==========================================
// 6. POSTING, LIKING, & EDITING ACTIONS
// ==========================================
async function handlePostMessage(e) {
  e.preventDefault();

  const name = document.getElementById('gbName').value.trim();
  const email = document.getElementById('gbEmail').value.trim();
  const website = document.getElementById('gbWebsite').value.trim();
  const body = document.getElementById('gbMessage').value.trim();

  // Assign or retrieve persistent unique visitor ID
  let visitorId = localStorage.getItem('gb_visitor_id');
  if (!visitorId) {
    visitorId = 'visitor_' + Math.random().toString(36.substring(2)) + Date.now();
    localStorage.setItem('gb_visitor_id', visitorId);
  }

  saveVisitorCredentials(name, email, website);

  const { error } = await supabase.from('guestbook').insert([
    {
      name,
      email: email || null,
      website: website || null,
      body,
      visitor_id: visitorId,
      is_admin: isAdmin,
      likes: 0,
      parent_id: null
    }
  ]);

  if (error) {
    alert('Error posting message: ' + error.message);
    return;
  }

  document.getElementById('gbMessage').value = '';
  fetchMessages();
}

function toggleReplyBox(messageId) {
  const box = document.getElementById(`reply-box-${messageId}`);
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

async function submitReply(parentId) {
  const name = document.getElementById(`reply-name-${parentId}`).value.trim();
  const email = document.getElementById(`reply-email-${parentId}`).value.trim();
  const website = document.getElementById(`reply-website-${parentId}`).value.trim();
  const body = document.getElementById(`reply-body-${parentId}`).value.trim();

  if (!name || !body) {
    alert('Name and message body are required for replies.');
    return;
  }

  let visitorId = localStorage.getItem('gb_visitor_id');
  if (!visitorId) {
    visitorId = 'visitor_' + Math.random().toString(36.substring(2)) + Date.now();
    localStorage.setItem('gb_visitor_id', visitorId);
  }

  const { error } = await supabase.from('guestbook').insert([
    {
      name,
      email: email || null,
      website: website || null,
      body,
      visitor_id: visitorId,
      is_admin: isAdmin,
      likes: 0,
      parent_id: parentId
    }
  ]);

  if (error) {
    alert('Error posting reply: ' + error.message);
    return;
  }

  fetchMessages();
}

async function likeMessage(id) {
  // Fetch current likes count first, then increment
  const { data, error: fetchError } = await supabase
    .from('guestbook')
    .select('likes')
    .eq('id', id)
    .single();

  if (fetchError) return;

  const newLikes = (data.likes || 0) + 1;
  const { error: updateError } = await supabase
    .from('guestbook')
    .update({ likes: newLikes })
    .eq('id', id);

  if (!updateError) {
    fetchMessages();
  }
}

async function editMessagePrompt(id, currentBody) {
  const updatedBody = prompt('Edit your message (allowed within 1 hour of posting):', currentBody);
  if (updatedBody === null || updatedBody.trim() === '') return;

  const { error } = await supabase
    .from('guestbook')
    .update({ body: updatedBody.trim() })
    .eq('id', id);

  if (error) {
    alert('Edit failed or 1-hour window has expired: ' + error.message);
  } else {
    fetchMessages();
  }
}

async function adminFixMessagePrompt(id, currentBody) {
  const confirmFix = confirm('⚠️ Admin Warning: Editing a visitor\'s message directly is highly discouraged. Proceed anyway?');
  if (!confirmFix) return;

  const updatedBody = prompt('[ADMIN FIX] Modify message content:', currentBody);
  if (updatedBody === null) return;

  const { error } = await supabase
    .from('guestbook')
    .update({ body: updatedBody.trim() })
    .eq('id', id);

  if (error) {
    alert('Admin fix failed: ' + error.message);
  } else {
    fetchMessages();
  }
}

// ==========================================
// 7. UTILITY HELPERS
// ==========================================
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function timeAgo(dateString) {
  const date = new Date(dateString);
  const seconds = Math.floor((new Date() - date) / 1000);
  
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  return "Just now";
}
