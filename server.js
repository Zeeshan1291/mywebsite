const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(session({ secret: 'secret123', resave: false, saveUninitialized: false }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage });

if (!fs.existsSync('data')) fs.mkdirSync('data');
const FILES = {
  users: 'data/users.json',
  posts: 'data/posts.json',
  groups: 'data/groups.json',
  notifs: 'data/notifs.json',
  stories: 'data/stories.json'
};
Object.values(FILES).forEach(f => { if (!fs.existsSync(f)) fs.writeFileSync(f, '[]'); });

const read = f => JSON.parse(fs.readFileSync(f));
const write = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));
const getUsers = () => read(FILES.users);
const saveUsers = d => write(FILES.users, d);
const getPosts = () => read(FILES.posts);
const savePosts = d => write(FILES.posts, d);
const getGroups = () => read(FILES.groups);
const saveGroups = d => write(FILES.groups, d);
const getNotifs = () => read(FILES.notifs);
const saveNotifs = d => write(FILES.notifs, d);
const getStories = () => read(FILES.stories);
const saveStories = d => write(FILES.stories, d);

const requireLogin = (req, res, next) => req.session.user ? next() : res.redirect('/login');
const onlineUsers = new Map();

function addNotif(to, from, type, text) {
  const notifs = getNotifs();
  notifs.push({ id: uuidv4(), to, from, type, text, read: false, time: new Date().toLocaleString() });
  saveNotifs(notifs);
}

// ===== AUTH =====
app.get('/', requireLogin, (req, res) => {
  const u = getUsers().find(x => x.username === req.session.user);
  const notifs = getNotifs().filter(n => n.to === req.session.user && !n.read);
  res.render('home', { user: req.session.user, theme: u?.theme || 'light', unread: notifs.length });
});

app.get('/signup', (req, res) => res.render('signup', { error: null }));
app.post('/signup', (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  if (users.find(u => u.username === username)) return res.render('signup', { error: 'User already exists!' });
  users.push({ username, password, bio: '', avatar: '', theme: 'light', followers: [], following: [], isPrivate: false });
  saveUsers(users);
  req.session.user = username;
  res.redirect('/');
});

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
  const u = getUsers().find(x => x.username === req.body.username && x.password === req.body.password);
  if (!u) return res.render('login', { error: 'Wrong credentials!' });
  if (u.banned) return res.render('login', { error: 'Account banned hai!' });
  req.session.user = u.username;
  res.redirect('/');
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

// ===== PROFILE =====
app.get('/profile', requireLogin, (req, res) => {
  const u = getUsers().find(x => x.username === req.session.user);
  const posts = getPosts().filter(p => p.user === req.session.user);
  res.render('profile', { user: u, isOwn: true, posts, currentUser: req.session.user });
});

app.get('/profile/:username', requireLogin, (req, res) => {
  const u = getUsers().find(x => x.username === req.params.username);
  if (!u) return res.redirect('/');
  const posts = getPosts().filter(p => p.user === req.params.username);
  res.render('profile', { user: u, isOwn: req.session.user === req.params.username, posts, currentUser: req.session.user });
});

app.post('/profile/update', requireLogin, upload.single('avatar'), (req, res) => {
  const users = getUsers();
  const idx = users.findIndex(x => x.username === req.session.user);
  if (req.body.bio !== undefined) users[idx].bio = req.body.bio;
  if (req.file) users[idx].avatar = '/uploads/' + req.file.filename;
  saveUsers(users);
  res.redirect('/profile');
});

app.post('/theme', requireLogin, (req, res) => {
  const users = getUsers();
  const idx = users.findIndex(x => x.username === req.session.user);
  users[idx].theme = users[idx].theme === 'dark' ? 'light' : 'dark';
  saveUsers(users);
  res.redirect('/');
});

app.post('/follow/:username', requireLogin, (req, res) => {
  const users = getUsers();
  const me = users.find(x => x.username === req.session.user);
  const target = users.find(x => x.username === req.params.username);
  if (!target || !me) return res.redirect('/');
  if (!me.following) me.following = [];
  if (!target.followers) target.followers = [];
  const isFollowing = me.following.includes(req.params.username);
  if (isFollowing) {
    me.following = me.following.filter(x => x !== req.params.username);
    target.followers = target.followers.filter(x => x !== req.session.user);
  } else {
    me.following.push(req.params.username);
    target.followers.push(req.session.user);
    addNotif(req.params.username, req.session.user, 'follow', req.session.user + ' ne aapko follow kiya!');
  }
  saveUsers(users);
  res.redirect('/profile/' + req.params.username);
});

// ===== POSTS =====
app.get('/posts', requireLogin, (req, res) => {
  const u = getUsers().find(x => x.username === req.session.user);
  const now = Date.now();
  const stories = getStories().filter(s => now - s.time < 24 * 60 * 60 * 1000);
  saveStories(stories);
  res.render('posts', { posts: getPosts().reverse(), user: req.session.user, theme: u?.theme || 'light', stories, users: getUsers() });
});

app.post('/post', requireLogin, upload.single('image'), (req, res) => {
  const posts = getPosts();
  posts.push({
    id: uuidv4(),
    user: req.session.user,
    content: req.body.content || '',
    image: req.file ? '/uploads/' + req.file.filename : null,
    likes: [],
    reactions: {},
    comments: [],
    time: new Date().toLocaleString()
  });
  savePosts(posts);
  res.redirect('/posts');
});

app.post('/react/:id', requireLogin, (req, res) => {
  const posts = getPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (post) {
    if (!post.reactions) post.reactions = {};
    const emoji = req.body.emoji;
    if (!post.reactions[emoji]) post.reactions[emoji] = [];
    const idx = post.reactions[emoji].indexOf(req.session.user);
    if (idx > -1) post.reactions[emoji].splice(idx, 1);
    else {
      post.reactions[emoji].push(req.session.user);
      if (post.user !== req.session.user) addNotif(post.user, req.session.user, 'react', req.session.user + ' ne ' + emoji + ' react kiya!');
    }
    savePosts(posts);
  }
  res.redirect('/posts');
});

app.post('/like/:id', requireLogin, (req, res) => {
  const posts = getPosts();
  const post = posts.find(p => p.id == req.params.id);
  if (post) {
    const idx = post.likes.indexOf(req.session.user);
    if (idx > -1) post.likes.splice(idx, 1);
    else {
      post.likes.push(req.session.user);
      if (post.user !== req.session.user) addNotif(post.user, req.session.user, 'like', req.session.user + ' ne aapki post like ki!');
    }
    savePosts(posts);
  }
  res.redirect('/posts');
});

app.post('/comment/:id', requireLogin, (req, res) => {
  const posts = getPosts();
  const post = posts.find(p => p.id == req.params.id);
  if (post) {
    post.comments.push({ user: req.session.user, text: req.body.comment });
    if (post.user !== req.session.user) addNotif(post.user, req.session.user, 'comment', req.session.user + ' ne comment kiya!');
    savePosts(posts);
  }
  res.redirect('/posts');
});

app.get('/search/posts', requireLogin, (req, res) => {
  const q = req.query.q || '';
  const posts = q ? getPosts().filter(p => p.content.toLowerCase().includes(q.toLowerCase())).reverse() : [];
  res.render('searchposts', { posts, q, user: req.session.user });
});

// ===== STORIES =====
app.post('/story', requireLogin, upload.single('image'), (req, res) => {
  const stories = getStories();
  stories.push({ id: uuidv4(), user: req.session.user, text: req.body.text || '', image: req.file ? '/uploads/' + req.file.filename : null, time: Date.now(), views: [] });
  saveStories(stories);
  res.redirect('/posts');
});

app.get('/story/:id', requireLogin, (req, res) => {
  const stories = getStories();
  const s = stories.find(x => x.id === req.params.id);
  if (!s) return res.redirect('/posts');
  if (!s.views.includes(req.session.user)) { s.views.push(req.session.user); saveStories(stories); }
  res.render('story', { story: s, user: req.session.user });
});

// ===== NOTIFICATIONS =====
app.get('/notifications', requireLogin, (req, res) => {
  const notifs = getNotifs().filter(n => n.to === req.session.user).reverse();
  const all = getNotifs();
  all.filter(n => n.to === req.session.user).forEach(n => n.read = true);
  saveNotifs(all);
  res.render('notifications', { notifs, user: req.session.user });
});

// ===== SEARCH =====
app.get('/search', requireLogin, (req, res) => {
  const q = req.query.q || '';
  const users = getUsers();
  const results = q ? users.filter(u => u.username.toLowerCase().includes(q.toLowerCase()) && u.username !== req.session.user) : [];
  res.render('search', { results, q, user: req.session.user });
});

// ===== EXPLORE =====
app.get('/explore', requireLogin, (req, res) => {
  res.render('explore', { posts: getPosts().reverse(), user: req.session.user, users: getUsers() });
});

// ===== CHAT =====
app.get('/chat', requireLogin, (req, res) => {
  const users = getUsers().filter(x => x.username !== req.session.user);
  res.render('chat', { user: req.session.user, allUsers: users });
});

app.get('/chat/:with', requireLogin, (req, res) => {
  const chatWith = req.params.with;
  const other = getUsers().find(x => x.username === chatWith);
  if (!other) return res.redirect('/chat');
  const chatFile = `data/chat_${[req.session.user, chatWith].sort().join('_')}.json`;
  const messages = fs.existsSync(chatFile) ? JSON.parse(fs.readFileSync(chatFile)) : [];
  res.render('chatroom', { user: req.session.user, chatWith, other, messages, isOnline: onlineUsers.has(chatWith) });
});

// ===== GROUPS =====
app.get('/groups', requireLogin, (req, res) => {
  res.render('groups', { user: req.session.user, groups: getGroups() });
});

app.post('/groups/create', requireLogin, (req, res) => {
  const groups = getGroups();
  groups.push({ id: uuidv4(), name: req.body.name, creator: req.session.user, members: [req.session.user], messages: [] });
  saveGroups(groups);
  res.redirect('/groups');
});

app.post('/groups/join/:id', requireLogin, (req, res) => {
  const groups = getGroups();
  const g = groups.find(x => x.id === req.params.id);
  if (g && !g.members.includes(req.session.user)) g.members.push(req.session.user);
  saveGroups(groups);
  res.redirect('/groups');
});

app.get('/groups/:id', requireLogin, (req, res) => {
  const g = getGroups().find(x => x.id === req.params.id);
  if (!g) return res.redirect('/groups');
  res.render('grouproom', { user: req.session.user, group: g });
});

// ===== CALLS =====
app.get('/call/:with', requireLogin, (req, res) => {
  res.render('videocall', { user: req.session.user, callWith: req.params.with });
});

app.get('/voice/:with', requireLogin, (req, res) => {
  res.render('voicecall', { user: req.session.user, callWith: req.params.with });
});

// ===== LIVE =====
app.get('/live', requireLogin, (req, res) => {
  res.render('live', { user: req.session.user });
});

// ===== GAMES =====
app.get('/games', requireLogin, (req, res) => {
  res.render('games', { user: req.session.user });
});

// ===== VIDEO DOWNLOADER =====
app.get('/downloader', requireLogin, (req, res) => {
  res.render('downloader', { user: req.session.user });
});

app.post('/download/youtube', requireLogin, async (req, res) => {
  try {
    const { url } = req.body;
    const ytdl = require('@distube/ytdl-core');
    if (!ytdl.validateURL(url)) return res.json({ error: 'Invalid YouTube URL!' });
    const info = await ytdl.getInfo(url);
    res.json({
      success: true,
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails.slice(-1)[0].url,
      channel: info.videoDetails.author.name,
      duration: Math.floor(info.videoDetails.lengthSeconds / 60) + ':' + (info.videoDetails.lengthSeconds % 60).toString().padStart(2,'0')
    });
  } catch(e) {
    res.json({ error: 'YouTube video nahi mili! ' + e.message });
  }
});

app.get('/stream/youtube', requireLogin, async (req, res) => {
  try {
    const ytdl = require('@distube/ytdl-core');
    const { url, type } = req.query;
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title.replace(/[^\w\s]/gi, '').substring(0,50);
    if (type === 'audio') {
      res.header('Content-Disposition', `attachment; filename="${title}.mp3"`);
      res.header('Content-Type', 'audio/mpeg');
      ytdl(url, { filter: 'audioonly', quality: 'highestaudio' }).pipe(res);
    } else {
      res.header('Content-Disposition', `attachment; filename="${title}.mp4"`);
      res.header('Content-Type', 'video/mp4');
      ytdl(url, { filter: 'videoandaudio', quality: 'highest' }).pipe(res);
    }
  } catch(e) {
    res.status(500).send('Download failed: ' + e.message);
  }
});

// ===== ADMIN =====
const getAdmin = () => {
  if (!fs.existsSync('data/admin.json')) {
    fs.writeFileSync('data/admin.json', JSON.stringify({ admins: ['Zeeshan Khan'], settings: { siteName: 'MySocialApp', allowSignup: true, maintenanceMode: false } }));
  }
  return JSON.parse(fs.readFileSync('data/admin.json'));
};
const saveAdmin = d => fs.writeFileSync('data/admin.json', JSON.stringify(d, null, 2));
const requireAdmin = (req, res, next) => {
  const admin = getAdmin();
  if (req.session.user && admin.admins.includes(req.session.user)) return next();
  res.redirect('/');
};

app.get('/admin', requireAdmin, (req, res) => {
  const admin = getAdmin();
  res.render('admin', {
    user: req.session.user,
    users: getUsers(),
    posts: getPosts(),
    groups: getGroups(),
    settings: admin.settings,
    admins: admin.admins,
    onlineCount: onlineUsers.size,
    onlineList: Array.from(onlineUsers.keys())
  });
});

app.post('/admin/ban/:username', requireAdmin, (req, res) => {
  const users = getUsers();
  const idx = users.findIndex(x => x.username === req.params.username);
  if (idx > -1) { users[idx].banned = !users[idx].banned; saveUsers(users); }
  res.redirect('/admin');
});

app.post('/admin/deleteuser/:username', requireAdmin, (req, res) => {
  saveUsers(getUsers().filter(x => x.username !== req.params.username));
  res.redirect('/admin');
});

app.post('/admin/deletepost/:id', requireAdmin, (req, res) => {
  savePosts(getPosts().filter(p => p.id !== req.params.id));
  res.redirect('/admin');
});

app.post('/admin/makeadmin/:username', requireAdmin, (req, res) => {
  const admin = getAdmin();
  if (!admin.admins.includes(req.params.username)) { admin.admins.push(req.params.username); saveAdmin(admin); }
  res.redirect('/admin');
});

app.post('/admin/settings', requireAdmin, (req, res) => {
  const admin = getAdmin();
  admin.settings.siteName = req.body.siteName;
  admin.settings.allowSignup = req.body.allowSignup === 'on';
  admin.settings.maintenanceMode = req.body.maintenanceMode === 'on';
  saveAdmin(admin);
  res.redirect('/admin');
});

app.post('/admin/broadcast', requireAdmin, (req, res) => {
  const notifs = getNotifs();
  getUsers().forEach(u => {
    notifs.push({ id: uuidv4(), to: u.username, from: 'Admin', type: 'broadcast', text: '📢 Admin: ' + req.body.message, read: false, time: new Date().toLocaleString() });
  });
  saveNotifs(notifs);
  res.redirect('/admin');
});

app.post('/admin/clearposts', requireAdmin, (req, res) => { savePosts([]); res.redirect('/admin'); });

app.get('/manifest.json', (req, res) => {
  res.json({ name: 'MySocialApp', short_name: 'SocialApp', start_url: '/', display: 'standalone', background_color: '#6a11cb', theme_color: '#2575fc', icons: [{ src: '/icon.png', sizes: '192x192', type: 'image/png' }] });
});

// ===== SOCKET.IO =====
io.on('connection', (socket) => {
  socket.on('userOnline', (username) => {
    onlineUsers.set(username, socket.id);
    io.emit('onlineUsers', Array.from(onlineUsers.keys()));
  });
  socket.on('joinRoom', room => socket.join(room));
  socket.on('joinGroup', groupId => socket.join('group_' + groupId));
  socket.on('chatMessage', (data) => {
    const { room, sender, receiver, message } = data;
    const msg = { sender, message, time: new Date().toLocaleTimeString() };
    const chatFile = `data/chat_${[sender, receiver].sort().join('_')}.json`;
    const msgs = fs.existsSync(chatFile) ? JSON.parse(fs.readFileSync(chatFile)) : [];
    msgs.push(msg);
    fs.writeFileSync(chatFile, JSON.stringify(msgs));
    io.to(room).emit('newMessage', msg);
  });
  socket.on('groupMessage', (data) => {
    const { groupId, sender, message } = data;
    const msg = { sender, message, time: new Date().toLocaleTimeString() };
    const groups = getGroups();
    const g = groups.find(x => x.id === groupId);
    if (g) { if (!g.messages) g.messages = []; g.messages.push(msg); saveGroups(groups); io.to('group_' + groupId).emit('groupMsg', msg); }
  });
  socket.on('callUser', (data) => {
    const target = onlineUsers.get(data.to);
    if (target) io.to(target).emit('incomingCall', { from: data.from, signal: data.signal, type: data.type || 'video' });
  });
  socket.on('answerCall', (data) => {
    const target = onlineUsers.get(data.to);
    if (target) io.to(target).emit('callAccepted', data.signal);
  });
  socket.on('endCall', (data) => {
    const target = onlineUsers.get(data.to);
    if (target) io.to(target).emit('callEnded');
  });
  socket.on('startLive', (data) => socket.broadcast.emit('liveStarted', data));
  socket.on('liveChatMsg', (data) => socket.broadcast.emit('liveChatMsg', data));
  socket.on('disconnect', () => {
    for (const [user, id] of onlineUsers.entries()) {
      if (id === socket.id) { onlineUsers.delete(user); break; }
    }
    io.emit('onlineUsers', Array.from(onlineUsers.keys()));
  });
});

server.listen(process.env.PORT || 8080, () => console.log('✅ Server running!'));
