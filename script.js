// ===============================
// JANTZ TV - SCRIPT.JS
// Home feed + channel pages + favorites + history + random
// Keeps 5+ minute filter
// Candace channel pulls completed livestreams only
// ===============================

const API_KEY = "AIzaSyDo4KpyOJQPcgafYmvpyBk3dPC1d56g27g";

const MIN_VIDEO_SECONDS = 300;
const VIDEO_LIMIT = 10;
const HOME_VIDEO_LIMIT = 10;
const MAX_HISTORY_ITEMS = 20;

const FAVORITES_KEY = "jantzTVFavoritesV2";
const LEGACY_FAVORITES_KEY = "jantzTVFavorites";
const HISTORY_KEY = "jantzTVWatchHistory";

const channels = [{
		name: "The Daily Show",
		tagline: "Comedy, news, chaos.",
		channelNumber: "CH 01",
		handle: "@TheDailyShow",
		feedType: "uploads"
	},
	{
		name: "Josh Johnson",
		tagline: "Stand-up + storytelling.",
		channelNumber: "CH 02",
		handle: "@JoshJohnsonComedy",
		feedType: "uploads"
	},
	{
		name: "First Things First",
		tagline: "Sports debate.",
		channelNumber: "CH 03",
		handle: "@FirstThingsFirst",
		feedType: "uploads"
	},
	{
		name: "The Young Turks",
		tagline: "News + politics.",
		channelNumber: "CH 04",
		handle: "@TheYoungTurks",
		feedType: "uploads"
	},
	{
		name: "Stephen A. Smith",
		tagline: "Stephen A. takes, sports, and chaos.",
		channelNumber: "CH 05",
		handle: "@stephenasmithspeaks",
		feedType: "uploads"
	},
	{
		name: "The Skip Bayless Show",
		tagline: "Skip unleashed.",
		channelNumber: "CH 06",
		handle: "@SkipBaylessShow",
		feedType: "uploads"
	},
	{
		name: "ESPN",
		tagline: "SportsCenter, highlights, and ESPN shows.",
		channelNumber: "CH 07",
		channelId: "UCiWLfSweyRNmLpgEHekhoAg",
		feedType: "uploads"
	},
	{
		name: "NBA on ESPN",
		tagline: "NBA debates, highlights, and analysis.",
		channelNumber: "CH 08",
		handle: "@nbaonespn",
		feedType: "uploads"
	},
	{
		name: "Candace Owens Live",
		tagline: "Completed livestreams only.",
		channelNumber: "CH 09",
		handle: "@RealCandaceO",
		feedType: "completedLives"
	}
];

let currentView = "home";
let currentChannelIndex = 0;
let currentVideo = null;
let currentLoadedVideos = [];

let channelInfoCache = {};
let videoResultsCache = {};

let favorites = loadFavoritesFromStorage();
let watchHistory = loadHistoryFromStorage();

const channelNumber = document.getElementById("channelNumber");
const screenSubtitle = document.getElementById("screenSubtitle");
const viewModeLabel = document.getElementById("viewModeLabel");
const channelName = document.getElementById("channelName");
const channelTagline = document.getElementById("channelTagline");
const videoPlayer = document.getElementById("videoPlayer");
const nowPlayingText = document.getElementById("nowPlayingText");
const currentVideoTitle = document.getElementById("currentVideoTitle");
const currentVideoChannel = document.getElementById("currentVideoChannel");

const recentVideosTitle = document.getElementById("recentVideosTitle");
const recentVideos = document.getElementById("recentVideos");
const favoritesList = document.getElementById("favoritesList");
const historyList = document.getElementById("historyList");

const homeBtn = document.getElementById("homeBtn");
const bottomHomeBtn = document.getElementById("bottomHomeBtn");
const prevChannel = document.getElementById("prevChannel");
const nextChannel = document.getElementById("nextChannel");
const randomBtn = document.getElementById("randomBtn");
const bottomRandomBtn = document.getElementById("bottomRandomBtn");
const refreshBtn = document.getElementById("refreshBtn");
const favoriteCurrentBtn = document.getElementById("favoriteCurrentBtn");
const openYouTubeBtn = document.getElementById("openYouTubeBtn");
const clearFavoritesBtn = document.getElementById("clearFavoritesBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const bottomFavoritesBtn = document.getElementById("bottomFavoritesBtn");

const guideBtn = document.getElementById("guideBtn");
const bottomGuideBtn = document.getElementById("bottomGuideBtn");
const guideOverlay = document.getElementById("guideOverlay");
const closeGuideBtn = document.getElementById("closeGuideBtn");
const guideList = document.getElementById("guideList");

function parseDuration(duration) {
	const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

	if (!match) {
		return 0;
	}

	const hours = parseInt(match[1] || 0);
	const minutes = parseInt(match[2] || 0);
	const seconds = parseInt(match[3] || 0);

	return hours * 3600 + minutes * 60 + seconds;
}

async function fetchJson(url) {
	const response = await fetch(url);
	const data = await response.json();

	if (!response.ok || data.error) {
		console.log("YouTube API error:", data.error || data);
		throw new Error(data.error?.message || "YouTube API request failed.");
	}

	return data;
}

function getChannelCacheKey(channel) {
	return channel.channelId || channel.handle || channel.name;
}

function getVideoCacheKey(channel) {
	return `${getChannelCacheKey(channel)}-${channel.feedType || "uploads"}`;
}

async function getChannelInfo(channel) {
	const cacheKey = getChannelCacheKey(channel);

	if (channelInfoCache[cacheKey]) {
		return channelInfoCache[cacheKey];
	}

	let url = "";

	if (channel.channelId) {
		url = `https://www.googleapis.com/youtube/v3/channels?key=${API_KEY}&part=id,contentDetails&id=${encodeURIComponent(channel.channelId)}`;
	} else {
		url = `https://www.googleapis.com/youtube/v3/channels?key=${API_KEY}&part=id,contentDetails&forHandle=${encodeURIComponent(channel.handle)}`;
	}

	const data = await fetchJson(url);

	if (!data.items || data.items.length === 0) {
		console.log("Could not find channel:", channel.name, channel.handle || channel.channelId);
		return null;
	}

	const item = data.items[0];

	const info = {
		channelId: item.id,
		uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || null
	};

	channelInfoCache[cacheKey] = info;

	return info;
}

async function fetchVideosForChannel(channel, limit = VIDEO_LIMIT, forceRefresh = false) {
	if (channel.feedType === "completedLives") {
		return fetchCompletedLiveVideos(channel, limit, forceRefresh);
	}

	return fetchUploadVideos(channel, limit, forceRefresh);
}

async function fetchUploadVideos(channel, limit = VIDEO_LIMIT, forceRefresh = false) {
	const cacheKey = getVideoCacheKey(channel);

	if (!forceRefresh && videoResultsCache[cacheKey]) {
		return videoResultsCache[cacheKey].slice(0, limit);
	}

	const channelInfo = await getChannelInfo(channel);

	if (!channelInfo || !channelInfo.uploadsPlaylistId) {
		return [];
	}

	let longVideos = [];
	let nextPageToken = "";
	let pagesChecked = 0;
	const maxPagesToCheck = 8;

	while (longVideos.length < limit && pagesChecked < maxPagesToCheck) {
		const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?key=${API_KEY}&part=snippet,contentDetails&playlistId=${channelInfo.uploadsPlaylistId}&maxResults=50&pageToken=${nextPageToken}`;

		const playlistData = await fetchJson(playlistUrl);

		if (!playlistData.items || playlistData.items.length === 0) {
			break;
		}

		const videoIds = playlistData.items
			.map(item => item.contentDetails?.videoId)
			.filter(Boolean)
			.join(",");

		if (!videoIds) {
			break;
		}

		const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${videoIds}&part=snippet,contentDetails,status`;

		const detailsData = await fetchJson(detailsUrl);

		const goodVideos = filterAndFormatVideos(detailsData.items || [], channel);

		longVideos = longVideos.concat(goodVideos);

		nextPageToken = playlistData.nextPageToken || "";
		pagesChecked++;

		if (!nextPageToken) {
			break;
		}
	}

	const uniqueVideos = dedupeVideos(longVideos).slice(0, limit);

	videoResultsCache[cacheKey] = uniqueVideos;

	return uniqueVideos;
}

async function fetchCompletedLiveVideos(channel, limit = VIDEO_LIMIT, forceRefresh = false) {
	const cacheKey = getVideoCacheKey(channel);

	if (!forceRefresh && videoResultsCache[cacheKey]) {
		return videoResultsCache[cacheKey].slice(0, limit);
	}

	const channelInfo = await getChannelInfo(channel);

	if (!channelInfo || !channelInfo.channelId) {
		return [];
	}

	let liveVideos = [];
	let nextPageToken = "";
	let pagesChecked = 0;
	const maxPagesToCheck = 4;

	while (liveVideos.length < limit && pagesChecked < maxPagesToCheck) {
		const searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&part=snippet&channelId=${encodeURIComponent(channelInfo.channelId)}&type=video&eventType=completed&order=date&maxResults=50&pageToken=${nextPageToken}`;

		const searchData = await fetchJson(searchUrl);

		if (!searchData.items || searchData.items.length === 0) {
			break;
		}

		const videoIds = searchData.items
			.map(item => item.id?.videoId)
			.filter(Boolean)
			.join(",");

		if (!videoIds) {
			break;
		}

		const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${videoIds}&part=snippet,contentDetails,status,liveStreamingDetails`;

		const detailsData = await fetchJson(detailsUrl);

		const goodVideos = filterAndFormatVideos(detailsData.items || [], channel).filter(video => {
			return video.wasCompletedLive === true;
		});

		liveVideos = liveVideos.concat(goodVideos);

		nextPageToken = searchData.nextPageToken || "";
		pagesChecked++;

		if (!nextPageToken) {
			break;
		}
	}

	const uniqueVideos = dedupeVideos(liveVideos).slice(0, limit);

	videoResultsCache[cacheKey] = uniqueVideos;

	return uniqueVideos;
}

function filterAndFormatVideos(items, channel) {
	return items
		.filter(video => {
			if (!video || !video.id || !video.snippet || !video.contentDetails) {
				return false;
			}

			const seconds = parseDuration(video.contentDetails.duration || "");
			const title = (video.snippet.title || "").toLowerCase();
			const description = (video.snippet.description || "").toLowerCase();

			const looksLikeShort =
				title.includes("#shorts") ||
				title.includes("shorts") ||
				description.includes("#shorts");

			const embeddable = video.status?.embeddable !== false;
			const isLongEnough = seconds >= MIN_VIDEO_SECONDS;

			if (channel.feedType === "completedLives") {
				const completedLive =
					video.liveStreamingDetails &&
					video.liveStreamingDetails.actualStartTime &&
					video.liveStreamingDetails.actualEndTime;

				return isLongEnough && !looksLikeShort && embeddable && completedLive;
			}

			return isLongEnough && !looksLikeShort && embeddable;
		})
		.map(video => {
			return {
				title: video.snippet.title,
				videoId: video.id,
				channelName: channel.name,
				channelNumber: channel.channelNumber,
				channelTagline: channel.tagline,
				handle: channel.handle || "",
				feedType: channel.feedType || "uploads",
				publishedAt: video.snippet.publishedAt || "",
				thumbnail: getBestThumbnail(video),
				durationSeconds: parseDuration(video.contentDetails.duration || ""),
				wasCompletedLive: Boolean(
					video.liveStreamingDetails &&
					video.liveStreamingDetails.actualStartTime &&
					video.liveStreamingDetails.actualEndTime
				)
			};
		});
}

function getBestThumbnail(video) {
	const thumbnails = video.snippet?.thumbnails || {};

	if (thumbnails.maxres?.url) {
		return thumbnails.maxres.url;
	}

	if (thumbnails.high?.url) {
		return thumbnails.high.url;
	}

	if (thumbnails.medium?.url) {
		return thumbnails.medium.url;
	}

	return `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`;
}

function dedupeVideos(videos) {
	const seen = new Set();

	return videos.filter(video => {
		if (!video || !video.videoId || seen.has(video.videoId)) {
			return false;
		}

		seen.add(video.videoId);
		return true;
	});
}

function sortNewestFirst(videos) {
	return videos.sort((a, b) => {
		return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
	});
}

function readableDate(dateString) {
	if (!dateString) {
		return "";
	}

	const date = new Date(dateString);

	if (Number.isNaN(date.getTime())) {
		return "";
	}

	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric"
	});
}

function setLoadingMessage(message) {
	recentVideos.innerHTML = `<p class="empty-message">${message}</p>`;
}

function setEmptyMessage(container, message) {
	container.innerHTML = `<p class="empty-message">${message}</p>`;
}

function updateHeaderForHome() {
	currentView = "home";

	channelNumber.textContent = "HOME";
	screenSubtitle.textContent = "Latest long videos from every channel.";
	viewModeLabel.textContent = "Home Feed";
	channelName.textContent = "Latest Long Videos";
	channelTagline.textContent = "Newest 5+ minute videos from all Jantz TV channels.";
	recentVideosTitle.textContent = "Latest Long Videos";
}

function updateHeaderForChannel(channel) {
	currentView = "channel";

	channelNumber.textContent = channel.channelNumber;
	screenSubtitle.textContent = channel.tagline;
	viewModeLabel.textContent = "Channel Page";
	channelName.textContent = channel.name;
	channelTagline.textContent = channel.tagline;
	recentVideosTitle.textContent = `${channel.channelNumber} Recent Videos`;
}

async function loadHomeFeed(forceRefresh = false) {
	updateHeaderForHome();

	currentLoadedVideos = [];
	setLoadingMessage("Loading newest long videos from all channels...");

	try {
		const results = await Promise.allSettled(
			channels.map(channel => fetchVideosForChannel(channel, VIDEO_LIMIT, forceRefresh))
		);

		let allVideos = [];

		results.forEach((result, index) => {
			if (result.status === "fulfilled") {
				allVideos = allVideos.concat(result.value);
			} else {
				console.log("Channel failed:", channels[index].name, result.reason);
			}
		});

		const homeVideos = sortNewestFirst(dedupeVideos(allVideos)).slice(0, HOME_VIDEO_LIMIT);

		currentLoadedVideos = homeVideos;

		renderVideos(homeVideos);

		if (homeVideos.length > 0) {
			playVideo(homeVideos[0], false);
		} else {
			videoPlayer.src = "";
			clearCurrentVideoDisplay();
			setEmptyMessage(recentVideos, "No 5+ minute videos found right now.");
		}
	} catch (error) {
		console.log("Home feed error:", error);
		setEmptyMessage(recentVideos, "Could not load the home feed. Check console.");
	}
}

async function loadChannel(channelIndex, forceRefresh = false) {
	currentChannelIndex = channelIndex;

	const channel = channels[currentChannelIndex];

	updateHeaderForChannel(channel);

	currentLoadedVideos = [];
	setLoadingMessage(`Loading ${channel.name}...`);

	try {
		const videos = await fetchVideosForChannel(channel, VIDEO_LIMIT, forceRefresh);

		currentLoadedVideos = videos;

		renderVideos(videos);

		if (videos.length > 0) {
			playVideo(videos[0], false);
		} else {
			videoPlayer.src = "";
			clearCurrentVideoDisplay();

			if (channel.feedType === "completedLives") {
				setEmptyMessage(recentVideos, "No completed 5+ minute livestreams found.");
			} else {
				setEmptyMessage(recentVideos, "No 5+ minute videos found for this channel.");
			}
		}
	} catch (error) {
		console.log("Channel load error:", error);
		setEmptyMessage(recentVideos, "Could not load this channel. Check console.");
	}
}

function renderVideos(videos) {
	recentVideos.innerHTML = "";

	if (!videos || videos.length === 0) {
		setEmptyMessage(recentVideos, "No videos found.");
		return;
	}

	videos.forEach(video => {
		const row = createVideoRow(video, {
			context: "feed"
		});

		recentVideos.appendChild(row);
	});
}

function createVideoRow(video, options = {}) {
	const row = document.createElement("div");
	row.classList.add("video-item");

	const thumb = document.createElement("div");
	thumb.classList.add("video-thumb");

	const img = document.createElement("img");
	img.src = video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`;
	img.alt = video.title;
	img.loading = "lazy";

	thumb.appendChild(img);

	const info = document.createElement("div");
	info.classList.add("video-info");

	const title = document.createElement("div");
	title.classList.add("video-title");
	title.textContent = video.title;

	const channel = document.createElement("div");
	channel.classList.add("video-channel");

	const dateText = readableDate(video.publishedAt);
	const liveText = video.wasCompletedLive ? " • Completed Live" : "";
	const datePart = dateText ? ` • ${dateText}` : "";

	channel.textContent = `${video.channelNumber || ""} ${video.channelName || ""}${datePart}${liveText}`.trim();

	info.appendChild(title);
	info.appendChild(channel);

	const action = document.createElement("button");
	action.classList.add("video-action");
	action.type = "button";

	if (options.context === "favorite") {
		action.textContent = "Remove";
		action.title = "Remove from favorites";
	} else {
		action.textContent = isFavorite(video.videoId) ? "★" : "☆";
		action.title = isFavorite(video.videoId) ? "Saved to favorites" : "Save to favorites";
	}

	action.addEventListener("click", function(event) {
		event.stopPropagation();

		if (options.context === "favorite") {
			removeFavorite(video.videoId);
		} else {
			toggleFavorite(video);
		}
	});

	row.appendChild(thumb);
	row.appendChild(info);
	row.appendChild(action);

	row.addEventListener("click", function() {
		playVideo(video, true);
	});

	return row;
}

function playVideo(video, addToHistory = true) {
	if (!video || !video.videoId) {
		return;
	}

	currentVideo = video;
	videoPlayer.src = `https://www.youtube.com/embed/${video.videoId}?rel=0`;

	currentVideoTitle.textContent = video.title;
	currentVideoChannel.textContent = `${video.channelName || "Jantz TV"}${video.wasCompletedLive ? " • Completed Live" : ""}`;
	nowPlayingText.textContent = video.channelName || "Jantz TV";

	updateFavoriteCurrentButton();

	if (addToHistory) {
		addVideoToHistory(video);
	}
}

function clearCurrentVideoDisplay() {
	currentVideo = null;
	currentVideoTitle.textContent = "Nothing playing yet";
	currentVideoChannel.textContent = "Choose a video from the list.";
	nowPlayingText.textContent = "Pick a video buddy.";
	updateFavoriteCurrentButton();
}

function getCurrentChannel() {
	return channels[currentChannelIndex];
}

function goHome() {
	loadHomeFeed(false);
}

function goToNextChannel() {
	if (currentView === "home") {
		loadChannel(0, false);
		return;
	}

	if (currentChannelIndex >= channels.length - 1) {
		loadHomeFeed(false);
		return;
	}

	loadChannel(currentChannelIndex + 1, false);
}

function goToPreviousChannel() {
	if (currentView === "home") {
		loadChannel(channels.length - 1, false);
		return;
	}

	if (currentChannelIndex <= 0) {
		loadHomeFeed(false);
		return;
	}

	loadChannel(currentChannelIndex - 1, false);
}

function refreshCurrentView() {
	if (currentView === "home") {
		loadHomeFeed(true);
		return;
	}

	loadChannel(currentChannelIndex, true);
}

function playRandomVideo() {
	if (!currentLoadedVideos || currentLoadedVideos.length === 0) {
		alert("No videos loaded yet.");
		return;
	}

	const randomIndex = Math.floor(Math.random() * currentLoadedVideos.length);
	playVideo(currentLoadedVideos[randomIndex], true);
}

function openCurrentVideoOnYouTube() {
	if (!currentVideo || !currentVideo.videoId) {
		alert("Pick a video first buddy.");
		return;
	}

	window.open(`https://www.youtube.com/watch?v=${currentVideo.videoId}`, "_blank");
}

function loadFavoritesFromStorage() {
	try {
		const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY));

		if (Array.isArray(saved)) {
			return dedupeVideos(saved);
		}
	} catch (error) {
		console.log("Could not load V2 favorites:", error);
	}

	try {
		const legacy = JSON.parse(localStorage.getItem(LEGACY_FAVORITES_KEY));

		if (legacy && typeof legacy === "object") {
			let migrated = [];

			Object.keys(legacy).forEach(channelName => {
				if (!Array.isArray(legacy[channelName])) {
					return;
				}

				legacy[channelName].forEach(video => {
					migrated.push({
						title: video.title,
						videoId: video.videoId,
						channelName: channelName,
						channelNumber: "★",
						publishedAt: video.publishedAt || "",
						thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`
					});
				});
			});

			migrated = dedupeVideos(migrated);

			localStorage.setItem(FAVORITES_KEY, JSON.stringify(migrated));

			return migrated;
		}
	} catch (error) {
		console.log("Could not migrate old favorites:", error);
	}

	return [];
}

function saveFavorites() {
	localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function isFavorite(videoId) {
	return favorites.some(video => video.videoId === videoId);
}

function toggleFavorite(video) {
	if (!video || !video.videoId) {
		return;
	}

	if (isFavorite(video.videoId)) {
		removeFavorite(video.videoId);
		return;
	}

	favorites.unshift(video);
	favorites = dedupeVideos(favorites);
	saveFavorites();

	renderFavorites();
	renderVideos(currentLoadedVideos);
	updateFavoriteCurrentButton();
}

function removeFavorite(videoId) {
	favorites = favorites.filter(video => video.videoId !== videoId);
	saveFavorites();

	renderFavorites();
	renderVideos(currentLoadedVideos);
	updateFavoriteCurrentButton();
}

function addCurrentVideoToFavorites() {
	if (!currentVideo) {
		alert("Pick a video first buddy.");
		return;
	}

	toggleFavorite(currentVideo);
}

function updateFavoriteCurrentButton() {
	if (!favoriteCurrentBtn) {
		return;
	}

	if (!currentVideo) {
		favoriteCurrentBtn.textContent = "☆";
		favoriteCurrentBtn.title = "Favorite current video";
		favoriteCurrentBtn.setAttribute("aria-label", "Favorite current video");
		return;
	}

	const saved = isFavorite(currentVideo.videoId);

	favoriteCurrentBtn.textContent = saved ? "★" : "☆";
	favoriteCurrentBtn.title = saved ? "Remove from favorites" : "Add to favorites";
	favoriteCurrentBtn.setAttribute(
		"aria-label",
		saved ? "Remove from favorites" : "Add to favorites"
	);
}

function renderFavorites() {
	favoritesList.innerHTML = "";

	if (!favorites || favorites.length === 0) {
		setEmptyMessage(favoritesList, "No favorites yet.");
		return;
	}

	favorites.forEach(video => {
		const row = createVideoRow(video, {
			context: "favorite"
		});

		favoritesList.appendChild(row);
	});
}

function clearFavorites() {
	if (!favorites.length) {
		return;
	}

	const confirmed = confirm("Clear all Jantz TV favorites?");

	if (!confirmed) {
		return;
	}

	favorites = [];
	saveFavorites();

	renderFavorites();
	renderVideos(currentLoadedVideos);
	updateFavoriteCurrentButton();
}

function loadHistoryFromStorage() {
	try {
		const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));

		if (Array.isArray(saved)) {
			return dedupeVideos(saved).slice(0, MAX_HISTORY_ITEMS);
		}
	} catch (error) {
		console.log("Could not load history:", error);
	}

	return [];
}

function saveHistory() {
	localStorage.setItem(HISTORY_KEY, JSON.stringify(watchHistory));
}

function addVideoToHistory(video) {
	if (!video || !video.videoId) {
		return;
	}

	watchHistory = watchHistory.filter(item => item.videoId !== video.videoId);
	watchHistory.unshift(video);
	watchHistory = watchHistory.slice(0, MAX_HISTORY_ITEMS);

	saveHistory();
	renderHistory();
}

function renderHistory() {
	historyList.innerHTML = "";

	if (!watchHistory || watchHistory.length === 0) {
		setEmptyMessage(historyList, "No watch history yet.");
		return;
	}

	watchHistory.forEach(video => {
		const row = createVideoRow(video, {
			context: "history"
		});

		historyList.appendChild(row);
	});
}

function clearHistory() {
	if (!watchHistory.length) {
		return;
	}

	const confirmed = confirm("Clear Jantz TV watch history?");

	if (!confirmed) {
		return;
	}

	watchHistory = [];
	saveHistory();
	renderHistory();
}

function buildGuide() {
	guideList.innerHTML = "";

	const homeButton = document.createElement("button");
	homeButton.type = "button";
	homeButton.classList.add("guide-item");
	homeButton.innerHTML = `
		<span>HOME</span>
		<strong>Latest Long Videos</strong>
		<small>Newest videos from every channel</small>
	`;

	homeButton.addEventListener("click", function() {
		closeGuide();
		loadHomeFeed(false);
	});

	guideList.appendChild(homeButton);

	channels.forEach((channel, index) => {
		const button = document.createElement("button");
		button.type = "button";
		button.classList.add("guide-item");

		const feedNote = channel.feedType === "completedLives" ? "Completed livestreams only" : channel.tagline;

		button.innerHTML = `
			<span>${channel.channelNumber}</span>
			<strong></strong>
			<small></small>
		`;

		button.querySelector("strong").textContent = channel.name;
		button.querySelector("small").textContent = feedNote;

		button.addEventListener("click", function() {
			closeGuide();
			loadChannel(index, false);
		});

		guideList.appendChild(button);
	});
}

function openGuide() {
	guideOverlay.classList.remove("hidden");
}

function closeGuide() {
	guideOverlay.classList.add("hidden");
}

function scrollToFavorites() {
	document.querySelector(".favorites-heading")?.scrollIntoView({
		behavior: "smooth",
		block: "start"
	});
}

homeBtn?.addEventListener("click", goHome);
bottomHomeBtn?.addEventListener("click", goHome);

nextChannel?.addEventListener("click", goToNextChannel);
prevChannel?.addEventListener("click", goToPreviousChannel);

refreshBtn?.addEventListener("click", refreshCurrentView);

randomBtn?.addEventListener("click", playRandomVideo);
bottomRandomBtn?.addEventListener("click", playRandomVideo);

favoriteCurrentBtn?.addEventListener("click", addCurrentVideoToFavorites);
openYouTubeBtn?.addEventListener("click", openCurrentVideoOnYouTube);

clearFavoritesBtn?.addEventListener("click", clearFavorites);
clearHistoryBtn?.addEventListener("click", clearHistory);

bottomFavoritesBtn?.addEventListener("click", scrollToFavorites);

guideBtn?.addEventListener("click", openGuide);
bottomGuideBtn?.addEventListener("click", openGuide);
closeGuideBtn?.addEventListener("click", closeGuide);

guideOverlay.addEventListener("click", function(event) {
	if (event.target === guideOverlay) {
		closeGuide();
	}
});

document.addEventListener("keydown", function(event) {
	if (event.key === "Escape") {
		closeGuide();
	}

	if (event.key === "ArrowRight") {
		goToNextChannel();
	}

	if (event.key === "ArrowLeft") {
		goToPreviousChannel();
	}
});

buildGuide();
renderFavorites();
renderHistory();
loadHomeFeed(false);