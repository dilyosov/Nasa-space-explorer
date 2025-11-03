// NASA APOD fetch and UI wiring
// We use the public DEMO_KEY by default. For production, replace with your own API key.
const NASA_API_URL = 'https://api.nasa.gov/planetary/apod';
const API_KEY = '0KY3m2wZ9CBLKOVAxo0XMfmH10JJdVoSzrbkYNsr'; // rate-limited; swap with your key for heavier use

document.addEventListener('DOMContentLoaded', () => {
	// Small 'Did you know?' facts to show on load. Keep these short and fun.
	const facts = [
		'Venus spins backward — the Sun rises in the west there.',
		'A day on Venus is longer than its year (it rotates very slowly).',
		'There are more trees on Earth than stars in the Milky Way galaxy (estimates vary).',
		'The footprints on the Moon will likely remain for millions of years — there is no wind to erase them.',
		'Neutron stars can spin at up to 700 times per second.',
		'Black holes aren’t “holes” — they’re extremely dense objects with gravity so strong that not even light can escape.',
		'Saturn’s rings are made of ice and rock and are surprisingly thin — sometimes only a few meters thick.',
		'The Hubble Space Telescope has observed galaxies so distant their light started traveling when the universe was under one billion years old.'
	];

	function showRandomFact() {
		const el = document.getElementById('dyk-text');
		if (!el) return;
		const idx = Math.floor(Math.random() * facts.length);
		el.textContent = facts[idx];
	}

	// show a fact on load and allow clicking the panel to refresh
	const dykPanel = document.getElementById('didYouKnow');
	if (dykPanel) {
		showRandomFact();
		dykPanel.addEventListener('click', showRandomFact);
	}

	const fromInput = document.getElementById('fromDate');
	const toInput = document.getElementById('toDate');
	const getBtn = document.getElementById('getImageBtn');
	const gallery = document.getElementById('gallery');

	// Helper to format Date object to YYYY-MM-DD
	function toISODate(d) {
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}`;
	}

	// Set default date range: last 7 days
	function setDefaultDates() {
		const today = new Date();
		const prior = new Date();
		prior.setDate(today.getDate() - 6); // 7 days including today
		toInput.value = toISODate(today);
		fromInput.value = toISODate(prior);
	}

	// Show a message in the gallery (placeholder / errors).
	// Accepts an optional `type` parameter: 'loading' | 'error' | undefined.
	// When `type === 'loading'` we render a more visible loading placeholder.
	function showMessage(text, type) {
		const cls = type === 'loading' ? 'placeholder loading' : 'placeholder';
		gallery.innerHTML = `\n      <div class="${cls}">\n        <p>${text}</p>\n      </div>`;
		// Also announce to assistive tech if available
		const sr = document.getElementById('sr-live');
		if (sr) sr.textContent = text;
	}
	
	// (Loading message is shown when fetching via fetchApod)

	// Render exactly 9 gallery slots for a 9-day window starting at `startDateStr`.
	// `itemsByDate` is a map of date (YYYY-MM-DD) -> APOD item returned by the API.
	// Made async so we can fetch missing thumbnails (Vimeo oEmbed) when necessary.
	async function renderImages(itemsByDate, startDateStr) {
		const startDate = new Date(startDateStr);
		if (isNaN(startDate.getTime())) {
			showMessage('Invalid start date for rendering.');
			return;
		}

		const today = new Date();

		const slots = [];
		// keep a list of gallery slots for lightbox navigation
		const gallerySlots = [];
		for (let i = 0; i < 9; i++) {
			const d = new Date(startDate);
			d.setDate(startDate.getDate() + i);
			const dateStr = toISODate(d);

			const item = itemsByDate[dateStr];

			if (item && item.media_type === 'image') {
				const url = item.url || item.hdurl || '';
				const title = item.title || '';
				const explanation = item.explanation || '';
				const duration = item.duration || item.video_duration || item.length || item.duration_seconds || item.runtime || null;
				// attach data-url and media so clicks open the lightbox
				slots.push(`\n          <figure class="photo" data-date="${dateStr}" data-url="${url}" data-media="image" data-tooltip="Open image in lightbox">\n            <img src="${url}" alt="${title}" loading="lazy" />\n            <figcaption>\n              <strong>${dateStr}</strong> — ${title}\n              <p class="explain">${explanation.substring(0, 200)}${explanation.length>200? '...':''}</p>\n            </figcaption>\n          </figure>`);
				gallerySlots.push({ date: dateStr, media: 'image', url, title, explanation, duration });
			} else if (item && item.media_type && item.media_type !== 'image') {
				// Non-image entry (usually a video). Show a placeholder with a link to the media.
				const url = item.url || '';
				const title = item.title || '(video)';
				const explanation = item.explanation || '';
				const duration = item.duration || item.video_duration || item.length || item.duration_seconds || item.runtime || null;
				// friendly duration string (may be null)
				const durationStr = formatDurationSeconds(duration);
				// try to find a thumbnail: API may provide thumbnail_url or we can infer YouTube thumb
				let thumb = item.thumbnail_url || '';
				const ytMatch = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
				if (!thumb && ytMatch) {
					thumb = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
				}
				// If still no thumb and it's a Vimeo URL, try the oEmbed endpoint to get a thumbnail.
				const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
				if (!thumb && vimeoMatch) {
					try {
						const oe = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
						if (oe.ok) {
							const oj = await oe.json();
							thumb = oj.thumbnail_url || oj.thumbnail_url_with_play_button || '';
						}
					} catch (fetchErr) {
						// silently ignore; we'll fall back to placeholder link below
						console.debug('Vimeo oEmbed failed', fetchErr);
					}
				}
				// If we have a thumbnail, render it with a play overlay and optional duration badge; otherwise show a placeholder with a link
				if (thumb) {
					slots.push(`\n          <figure class="photo placeholder-photo video" data-date="${dateStr}" data-url="${url}" data-media="video" data-tooltip="Play video">\n            <div class="video-wrap">\n              <img class="video-thumb" src="${thumb}" alt="${title}" loading="lazy"/>\n              <div class="video-overlay" role="button" aria-label="Play video" tabindex="0">▶</div>\n              ${durationStr ? `<div class="video-duration">${durationStr}</div>` : ''}\n            </div>\n            <figcaption>\n              <strong>${dateStr}</strong> — ${title}\n              <p class="explain">Video entry — click to view</p>\n            </figcaption>\n          </figure>`);
				} else {
					slots.push(`\n          <figure class="photo placeholder-photo" data-date="${dateStr}" data-url="${url}" data-media="video" data-tooltip="Open video">\n            <div class="video-placeholder">▶</div>\n            <figcaption>\n              <strong>${dateStr}</strong> — ${title}\n              <p class="explain">Video entry — <a href="${url}" target="_blank" rel="noopener">open video</a></p>\n            </figcaption>\n          </figure>`);
				}
				gallerySlots.push({ date: dateStr, media: 'video', url, title, explanation, thumb, duration, durationStr });
			} else if (d > today) {
				// Future date (no APOD yet)
				slots.push(`\n          <figure class="photo placeholder-photo future" data-date="${dateStr}" data-media="none" data-tooltip="APOD page for this date">\n            <div class="future-placeholder">✨</div>\n            <figcaption>\n              <strong>${dateStr}</strong> — Future date\n              <p class="explain">No image available for future dates.</p>\n            </figcaption>\n          </figure>`);
				gallerySlots.push({ date: dateStr, media: 'none' });
			} else {
				// No data for that date
				slots.push(`\n          <figure class="photo placeholder-photo empty" data-date="${dateStr}" data-media="none" data-tooltip="APOD page for this date">\n            <div class="no-image">🛰️</div>\n            <figcaption>\n              <strong>${dateStr}</strong> — No image\n              <p class="explain">APOD not available for this date.</p>\n            </figcaption>\n          </figure>`);
				gallerySlots.push({ date: dateStr, media: 'none' });
			}
		}

	gallery.innerHTML = `<div class="photos">${slots.join('\n')}</div>`;

	// Announce to screen reader the update
	const sr = document.getElementById('sr-live');
	if (sr) sr.textContent = `Displayed 9-day view starting ${startDateStr}`;

		// Attach click handler to make placeholders interactive.
		// Clicking an item opens the lightbox for images, opens videos in a new tab,
		// or opens the APOD page for placeholders.
		gallery.onclick = (ev) => {
			// If the user clicked a normal link inside a caption (e.g. fallback "open video"),
			// allow the browser to follow it instead of intercepting the click.
			if (ev.target.closest && ev.target.closest('a')) return;
			const fig = ev.target.closest('figure.photo');
			if (!fig) return;
			const url = fig.dataset.url;
			const date = fig.dataset.date;
			const media = fig.dataset.media;

			if ((media === 'image' || media === 'video') && (url || media === 'video')) {
				// find index in gallerySlots for this date and media
				const index = gallerySlots.findIndex(s => s.date === date && s.media === media);
				if (index >= 0) openLightboxAtIndex(index, gallerySlots);
				return;
			}

			if (date) {
				const d = new Date(date);
				if (isNaN(d.getTime())) return;
				const yy = String(d.getFullYear() % 100).padStart(2, '0');
				const mm = String(d.getMonth() + 1).padStart(2, '0');
				const dd = String(d.getDate()).padStart(2, '0');
				const apodPage = `https://apod.nasa.gov/apod/ap${yy}${mm}${dd}.html`;
				window.open(apodPage, '_blank', 'noopener');
			}
		};

		// Allow keyboard activation of the play overlay (Enter/Space) — overlay has tabindex="0"
		gallery.addEventListener('keydown', (e) => {
			const t = e.target;
			if (!t) return;
			if (t.classList && t.classList.contains('video-overlay') && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
				t.click();
				e.preventDefault();
			}
		});

		// Lightbox implementation
		let lightboxOpen = false;
		let currentLightboxIndex = -1;

		function ensureLightboxExists() {
			if (document.getElementById('apod-lightbox')) return;
			const lb = document.createElement('div');
			lb.id = 'apod-lightbox';
			lb.innerHTML = `\n      <div class="lb-overlay" tabindex="-1">\n        <button class="lb-close" aria-label="Close">✕</button>\n        <button class="lb-prev" aria-label="Previous">‹</button>\n        <button class="lb-next" aria-label="Next">›</button>\n        <div class="lb-content">\n          <div class="lb-media"></div>\n          <div class="lb-caption"></div>\n          <div class="lb-explanation"></div>\n        </div>\n      </div>`;
			document.body.appendChild(lb);

			// handlers
			lb.querySelector('.lb-close').addEventListener('click', closeLightbox);
			lb.querySelector('.lb-prev').addEventListener('click', () => navigateLightbox(-1));
			lb.querySelector('.lb-next').addEventListener('click', () => navigateLightbox(1));
			lb.querySelector('.lb-overlay').addEventListener('click', (e) => {
				if (e.target.classList.contains('lb-overlay')) closeLightbox();
			});

			// Touch/swipe support
			let touchStartX = 0;
			let touchCurrentX = 0;
			let touching = false;
			const overlay = lb.querySelector('.lb-overlay');
			overlay.addEventListener('touchstart', (e) => {
				if (e.touches && e.touches.length === 1) {
					touching = true;
					touchStartX = e.touches[0].clientX;
				}
			}, { passive: true });
			overlay.addEventListener('touchmove', (e) => {
				if (!touching) return;
				touchCurrentX = e.touches[0].clientX;
			}, { passive: true });
			overlay.addEventListener('touchend', (e) => {
				if (!touching) return;
				const dx = touchCurrentX - touchStartX;
				const threshold = 50; // px
				if (dx > threshold) navigateLightbox(-1);
				else if (dx < -threshold) navigateLightbox(1);
				touching = false;
				touchStartX = touchCurrentX = 0;
			});
		}

		// Helper: detect embed URL for YouTube/Vimeo or fallback
		function getEmbedForUrl(url) {
			if (!url) return { type: 'unknown' };
			// YouTube patterns
			const ytMatch = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
			if (ytMatch) {
				return { type: 'youtube', embed: `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&autoplay=1` };
			}
			// Vimeo patterns
			const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
			if (vimeoMatch) {
				return { type: 'vimeo', embed: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1` };
			}
			// If it's already an embed URL
			if (url.includes('youtube.com/embed') || url.includes('player.vimeo.com')) {
				return { type: 'embed', embed: url };
			}
			// Unknown
			return { type: 'unknown' };
		}

		// Format seconds (or mm:ss-ish) to hh:mm:ss or mm:ss
		function formatDurationSeconds(val) {
			if (!val && val !== 0) return null;
			let seconds = Number(val);
			if (isNaN(seconds)) return null;
			const h = Math.floor(seconds / 3600);
			const m = Math.floor((seconds % 3600) / 60);
			const s = Math.floor(seconds % 60);
			if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
			return `${m}:${String(s).padStart(2,'0')}`;
		}

		// Preload helper: preload image or thumbnail for given slot index
		function preloadIndex(idx, slots) {
			if (!slots || !slots.length) return;
			const len = slots.length;
			if (idx < 0 || idx >= len) return;
			const entry = slots[idx];
			if (!entry) return;
			if (entry.media === 'image' && entry.url) {
				const img = new Image();
				img.src = entry.url;
			}
			if (entry.media === 'video' && entry.thumb) {
				const img = new Image();
				img.src = entry.thumb;
			}
		}

		function openLightboxAtIndex(idx, slots) {
			ensureLightboxExists();
			const lb = document.getElementById('apod-lightbox');
			const overlay = lb.querySelector('.lb-overlay');
			const mediaContainer = lb.querySelector('.lb-media');
			const capEl = lb.querySelector('.lb-caption');

			currentLightboxIndex = idx;
			const entry = slots[currentLightboxIndex];
			if (!entry) return;

			// Clear previous content
			mediaContainer.innerHTML = '';

			if (entry.media === 'image') {
				const img = document.createElement('img');
				img.className = 'lb-img';
				img.src = entry.url;
				img.alt = entry.title || '';
				mediaContainer.appendChild(img);
			} else if (entry.media === 'video') {
				const info = getEmbedForUrl(entry.url);
				if (info.type === 'youtube' || info.type === 'vimeo' || info.type === 'embed') {
					const iframe = document.createElement('iframe');
					iframe.src = info.embed;
					iframe.width = '960';
					iframe.height = '540';
					iframe.frameBorder = '0';
					// Use the `allow` attribute and include 'fullscreen' there to avoid browser warnings
					iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
					iframe.className = 'lb-iframe';
					mediaContainer.appendChild(iframe);
				} else {
					// Fallback: try to show link
					const link = document.createElement('a');
					link.href = entry.url;
					link.target = '_blank';
					link.rel = 'noopener';
					link.textContent = 'Open video in new tab';
					link.className = 'lb-link';
					mediaContainer.appendChild(link);
				}
			} else {
				// No media: show a simple message and link to APOD page
				const p = document.createElement('div');
				p.className = 'lb-empty';
				const link = document.createElement('a');
				const d = new Date(entry.date);
				const yy = String(d.getFullYear() % 100).padStart(2, '0');
				const mm = String(d.getMonth() + 1).padStart(2, '0');
				const dd = String(d.getDate()).padStart(2, '0');
				link.href = `https://apod.nasa.gov/apod/ap${yy}${mm}${dd}.html`;
				link.target = '_blank';
				link.rel = 'noopener';
				link.textContent = 'Open APOD page';
				p.appendChild(link);
				mediaContainer.appendChild(p);
			}

			capEl.textContent = `${entry.date} — ${entry.title || ''}`;
			const explEl = lb.querySelector('.lb-explanation');
			if (explEl) {
				explEl.textContent = entry.explanation || '';
			}

			// preload previous and next
			preloadIndex((currentLightboxIndex - 1 + slots.length) % slots.length, slots);
			preloadIndex((currentLightboxIndex + 1) % slots.length, slots);

			// animate open
			overlay.classList.add('open');
			overlay.classList.add('zoom');
			lightboxOpen = true;

			// keyboard navigation
				document.addEventListener('keydown', onKeyDown);
		}

		function closeLightbox() {
			const lb = document.getElementById('apod-lightbox');
			if (!lb) return;
			const overlay = lb.querySelector('.lb-overlay');
			overlay.classList.remove('open');
			overlay.classList.remove('zoom');
			// clear media to stop videos
			const mediaContainer = lb.querySelector('.lb-media');
			if (mediaContainer) mediaContainer.innerHTML = '';
			lightboxOpen = false;
			currentLightboxIndex = -1;
			document.removeEventListener('keydown', onKeyDown);
		}

		function navigateLightbox(direction) {
			if (currentLightboxIndex < 0) return;
			const len = gallerySlots.length;
			let i = currentLightboxIndex + direction;
			if (i < 0) i = len - 1;
			if (i >= len) i = 0;
			// Move to the next slot (can be image or video or none)
			openLightboxAtIndex(i, gallerySlots);
		}

		function onKeyDown(e) {
			if (!lightboxOpen) return;
			if (e.key === 'Escape') closeLightbox();
			if (e.key === 'ArrowLeft') navigateLightbox(-1);
			if (e.key === 'ArrowRight') navigateLightbox(1);
		}
	}

	// Fetch images from NASA APOD for a date range
	async function fetchApod(startDate, endDate) {
		// NASA APOD supports a range request with start_date & end_date
		const params = new URLSearchParams({
			api_key: API_KEY,
			start_date: startDate,
			end_date: endDate,
		});
		const url = `${NASA_API_URL}?${params.toString()}`;

	showMessage('🔄 Loading space photos…', 'loading');

		try {
			// Retry loop for transient server errors (504, 502, 503) or network failures.
			const maxAttempts = 3;
			let attempt = 0;
			let res;
			for (; attempt < maxAttempts; attempt++) {
				if (attempt > 0) {
					const sr = document.getElementById('sr-live');
					const msg = `Network issue, retrying (${attempt}/${maxAttempts - 1})...`;
					showMessage(msg, 'loading');
					if (sr) sr.textContent = msg;
					// exponential backoff (250ms, 500ms, ...)
					const backoff = 250 * Math.pow(2, attempt - 1);
					await new Promise(r => setTimeout(r, backoff));
				}
				try {
					res = await fetch(url);
				} catch (netErr) {
					// network-level failure (DNS, CORS blocked, offline). Continue to retry.
					console.warn('Network fetch failed, will retry if attempts remain', netErr);
					res = null;
				}
				if (res && res.ok) break;
				// If we received a response but it's a server error that might be transient, retry.
				if (res && ([502, 503, 504].includes(res.status))) {
					console.warn(`Server returned ${res.status}, attempt ${attempt + 1} of ${maxAttempts}`);
					continue;
				}
				// For other non-ok responses (4xx), don't retry.
				if (res && !res.ok) break;
			}

			if (!res) throw new Error('Network failure while fetching APOD (no response)');
			if (!res.ok) {
				const txt = await res.text();
				throw new Error(`API error: ${res.status} ${txt}`);
			}

			const data = await res.json();

			// If single object returned, wrap into array
			const items = Array.isArray(data) ? data : [data];

			// Build a map of date -> item for quick lookup
			const itemsByDate = {};
			items.forEach(it => {
				if (it && it.date) itemsByDate[it.date] = it;
			});

			// Render a 9-item gallery starting from the requested start date
			await renderImages(itemsByDate, startDate);
		} catch (err) {
			console.error('Failed to fetch APOD:', err);
			// Give a clearer message when it's a gateway timeout (504)
			const msg = /504/.test(String(err.message))
				? 'Server timeout (504). Try again in a moment.'
				: 'Failed to load images. Try a smaller range or check your network/API key.';
			showMessage(msg, 'error');
		}
	}

	// Button handler: compute 9-day range from selected date and call fetch
	getBtn.addEventListener('click', () => {
		// Use From as the start if present, otherwise fall back to To
		const startSelected = fromInput.value || toInput.value;

		if (!startSelected) {
			showMessage('Please select a start date (use From or To).');
			return;
		}

		const s = new Date(startSelected);
		if (isNaN(s.getTime())) {
			showMessage('Invalid start date.');
			return;
		}

		// Compute a 9-day window: start + 8 days = 9 consecutive days including start
		const endDate = new Date(s);
		endDate.setDate(s.getDate() + 8);

		const today = new Date();
		// If endDate is in the future, cap it to today
		let truncated = false;
		if (endDate > today) {
			endDate.setTime(today.getTime());
			truncated = true;
		}

		const startStr = toISODate(s);
		const endStr = toISODate(endDate);

		// Update the To input so users see the actual range being requested
		toInput.value = endStr;

		if (truncated) {
			showMessage('Selected 9-day window extends into the future; fetching up to today.');
		}

		fetchApod(startStr, endStr);
	});

	// Initialize UI
	setDefaultDates();
});