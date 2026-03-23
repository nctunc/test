const suggestionForm = document.getElementById('suggestionForm');
const suggestionsList = document.getElementById('suggestionsList');
const formMessage = document.getElementById('formMessage');
const suggestionCount = document.getElementById('suggestionCount');
const template = document.getElementById('suggestionTemplate');

function getClientId() {
  const key = 'team-activity-client-id';
  let clientId = window.localStorage.getItem(key);
  if (!clientId) {
    clientId = window.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(key, clientId);
  }
  return clientId;
}

function getLikedSuggestionIds() {
  try {
    return JSON.parse(window.localStorage.getItem('team-activity-liked-ids') || '[]');
  } catch (error) {
    return [];
  }
}

function saveLikedSuggestionId(suggestionId) {
  const liked = new Set(getLikedSuggestionIds());
  liked.add(Number(suggestionId));
  window.localStorage.setItem('team-activity-liked-ids', JSON.stringify([...liked]));
}

function setMessage(text, type = '') {
  formMessage.textContent = text;
  formMessage.className = `form-message ${type}`.trim();
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? 'Just now' : date.toLocaleString();
}

function renderSuggestions(suggestions) {
  suggestionsList.innerHTML = '';
  suggestionCount.textContent = `${suggestions.length} ${suggestions.length === 1 ? 'idea' : 'ideas'}`;

  if (!suggestions.length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No suggestions yet — add the first team activity idea.';
    suggestionsList.appendChild(emptyState);
    return;
  }

  const likedIds = new Set(getLikedSuggestionIds().map(Number));

  suggestions.forEach((suggestion) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector('.suggestion-title').textContent = suggestion.title;
    node.querySelector('.likes-pill').textContent = `${suggestion.likes} 👍`;

    const descriptionNode = node.querySelector('.suggestion-description');
    if (suggestion.description) {
      descriptionNode.textContent = suggestion.description;
    } else {
      descriptionNode.textContent = 'No extra details provided.';
      descriptionNode.classList.add('hero-copy');
    }

    node.querySelector('.suggestion-meta').textContent = `Added ${formatDate(suggestion.createdAt)}`;

    const likeButton = node.querySelector('.like-button');
    const alreadyLiked = likedIds.has(Number(suggestion.id));
    likeButton.disabled = alreadyLiked;
    likeButton.textContent = alreadyLiked ? 'Liked' : '👍 Like';
    likeButton.addEventListener('click', async () => {
      likeButton.disabled = true;
      try {
        const response = await fetch(`/api/suggestions/${suggestion.id}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: getClientId() }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Unable to like suggestion.');
        }
        saveLikedSuggestionId(suggestion.id);
        await loadSuggestions();
      } catch (error) {
        likeButton.disabled = false;
        window.alert(error.message);
      }
    });

    suggestionsList.appendChild(node);
  });
}

async function loadSuggestions() {
  const response = await fetch('/api/suggestions');
  const payload = await response.json();
  renderSuggestions(payload.suggestions || []);
}

suggestionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');

  const formData = new FormData(suggestionForm);
  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim();

  if (!title) {
    setMessage('Please add a title.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Unable to save suggestion.');
    }
    suggestionForm.reset();
    setMessage('Suggestion added successfully.', 'success');
    await loadSuggestions();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

loadSuggestions().catch((error) => {
  setMessage(`Failed to load suggestions: ${error.message}`, 'error');
});
