// ===============================
// JANTZ TV - SCRIPT.JS
// Uses handles, smart paging, 5+ minute filter
// ===============================

const API_KEY = "AIzaSyDo4KpyOJQPcgafYmvpyBk3dPC1d56g27g";

const channels = [{
		name: "The Daily Show",
		tagline: "Comedy, news, chaos.",
		channelNumber: "CH 01",
		handle: "@TheDailyShow"
	},
	{
		name: "Josh Johnson",
		tagline: "Stand-up + storytelling.",
		channelNumber: "CH 02",
		handle: "@JoshJohnsonComedy"
	},
	{
		name: "First Things First",
		tagline: "Sports debate.",
		channelNumber: "CH 03",
		handle: "@FirstThingsFirst"
	},
	{
		name: "The Young Turks",
		tagline: "News + politics.",
		channelNumber: "CH 04",
		handle: "@TheYoungTurks"
	}
];

let currentChannelIndex = 0;
let currentVideo = null;
let channelCache = {};
let favorites = JSON.parse(localStorage.getItem("jantzTVFavorites")) || {};

const channelNumber = document.getElementById("channelNumber");
const channelName = document.getElementById("channelName");
const channelTagline = document.getElementById("channelTagline");
const videoPlayer = document.getElementById("videoPlayer");
const recentVideos = document.getElementById("recentVideos");
const favoritesList = document.getElementById("favoritesList");

const prevChannel = document.getElementById("prevChannel");
const nextChannel = document.getElementById("nextChannel");
const refreshBtn = document.getElementById("refreshBtn");
const openYouTubeBtn = document.getElementById("openYouTubeBtn");

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

	if (data.error) {
		console.log("YouTube API error:", data.error);
	}

	return data;
}

async function getUploadsPlaylist(channel) {
	if (channelCache[channel.handle]) {
		return channelCache[channel.handle];
	}

	const url = `https://www.googleapis.com/youtube/v3/channels?key=${API_KEY}&part=contentDetails&forHandle=${encodeURIComponent(channel.handle)}`;

	const data = await fetchJson(url);

	if (!data.items || data.items.length === 0) {
		console.log("Could not find channel:", channel.name, channel.handle);
		return null;
	}

	const uploadsPlaylistId = data.items[0].contentDetails.relatedPlaylists.uploads;

	channelCache[channel.handle] = uploadsPlaylistId;

	return uploadsPlaylistId;
}

async function fetchVideos(channel) {
	const uploadsPlaylistId = await getUploadsPlaylist(channel);

	if (!uploadsPlaylistId) {
		return [];
	}

	let longVideos = [];
	let nextPageToken = "";
	let pagesChecked = 0;
	const maxPagesToCheck = 8;

	while (longVideos.length < 4 && pagesChecked < maxPagesToCheck) {
		const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?key=${API_KEY}&part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&pageToken=${nextPageToken}`;

		const playlistData = await fetchJson(playlistUrl);

		if (!playlistData.items || playlistData.items.length === 0) {
			console.log("No playlist items found for:", channel.name);
			break;
		}

		const videoIds = playlistData.items
			.map(item => item.contentDetails.videoId)
			.filter(Boolean)
			.join(",");

		if (!videoIds) {
			break;
		}

		const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${videoIds}&part=snippet,contentDetails,status`;

		const detailsData = await fetchJson(detailsUrl);

		if (!detailsData.items || detailsData.items.length === 0) {
			console.log("No video details found for:", channel.name);
			break;
		}

		detailsData.items.forEach(video => {
			const seconds = parseDuration(video.contentDetails.duration);

			const title = video.snippet.title.toLowerCase();
			const description = video.snippet.description.toLowerCase();

			const looksLikeShort =
				title.includes("#shorts") ||
				title.includes("shorts") ||
				description.includes("#shorts");

			const embeddable = video.status.embeddable !== false;

			if (seconds >= 300 && !looksLikeShort && embeddable) {
				longVideos.push({
					title: video.snippet.title,
					videoId: video.id
				});
			}
		});

		nextPageToken = playlistData.nextPageToken || "";
		pagesChecked++;

		if (!nextPageToken) {
			break;
		}
	}

	return longVideos.slice(0, 4);
}

function getThumbnail(videoId) {
	return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

function getCurrentChannel() {
	return channels[currentChannelIndex];
}

function saveFavorites() {
	localStorage.setItem("jantzTVFavorites", JSON.stringify(favorites));
}

async function loadChannel() {
	const channel = getCurrentChannel();

	channelNumber.textContent = channel.channelNumber;
	channelName.textContent = channel.name;
	channelTagline.textContent = channel.tagline;

	videoPlayer.src = "";
	recentVideos.innerHTML = `<p class="empty-message">Loading...</p>`;
	favoritesList.innerHTML = "";

	try {
		const videos = await fetchVideos(channel);

		recentVideos.innerHTML = "";

		if (videos.length === 0) {
			recentVideos.innerHTML = `<p class="empty-message">No 5+ minute videos found.</p>`;
			loadFavorites();
			return;
		}

		videos.forEach(video => {
			const row = createVideoRow(video, channel.name);
			recentVideos.appendChild(row);
		});

		playVideo(videos[0]);
		loadFavorites();
	} catch (error) {
		console.log("Load channel error:", error);
		recentVideos.innerHTML = `<p class="empty-message">Could not load videos. Check console.</p>`;
		loadFavorites();
	}
}

function createVideoRow(video, channelTitle) {
	const row = document.createElement("div");
	row.classList.add("video-item");

	row.innerHTML = `
    <div class="video-thumb">
      <img src="${getThumbnail(video.videoId)}" alt="${video.title}">
    </div>

    <div class="video-info">
      <div class="video-title">${video.title}</div>
      <div class="video-channel">${channelTitle}</div>
    </div>
  `;

	row.addEventListener("click", function() {
		playVideo(video);
	});

	return row;
}

function playVideo(video) {
	currentVideo = video;
	videoPlayer.src = `https://www.youtube.com/embed/${video.videoId}`;
}

function loadFavorites() {
	const channel = getCurrentChannel();

	favoritesList.innerHTML = "";

	if (!favorites[channel.name]) {
		favorites[channel.name] = [];
	}

	if (favorites[channel.name].length === 0) {
		favoritesList.innerHTML = `<p class="empty-message">No favorites yet.</p>`;
		return;
	}

	favorites[channel.name].forEach(video => {
		const row = createVideoRow(video, "★ Favorite");
		favoritesList.appendChild(row);
	});
}

function addCurrentVideoToFavorites() {
	const channel = getCurrentChannel();

	if (!currentVideo) {
		return;
	}

	if (!favorites[channel.name]) {
		favorites[channel.name] = [];
	}

	const alreadySaved = favorites[channel.name].some(video => {
		return video.videoId === currentVideo.videoId;
	});

	if (alreadySaved) {
		alert("Already saved to favorites.");
		return;
	}

	favorites[channel.name].push(currentVideo);
	saveFavorites();
	loadFavorites();
	alert("Saved to favorites.");
}

function openCurrentVideoOnYouTube() {
	if (!currentVideo) {
		return;
	}

	window.open(`https://www.youtube.com/watch?v=${currentVideo.videoId}`, "_blank");
}

function goToNextChannel() {
	currentChannelIndex = (currentChannelIndex + 1) % channels.length;
	loadChannel();
}

function goToPreviousChannel() {
	currentChannelIndex =
		(currentChannelIndex - 1 + channels.length) % channels.length;

	loadChannel();
}

nextChannel.addEventListener("click", goToNextChannel);
prevChannel.addEventListener("click", goToPreviousChannel);
refreshBtn.addEventListener("click", loadChannel);
openYouTubeBtn.addEventListener("click", openCurrentVideoOnYouTube);

recentVideos.addEventListener("dblclick", addCurrentVideoToFavorites);

loadChannel();