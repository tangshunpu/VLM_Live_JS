# VLM Live WebUI

A browser-based, real-time Vision-Language Model demo UI implemented in pure JavaScript with no backend.

### Supported Backends

- OpenAI official API (`https://api.openai.com/v1`)
- OpenAI-compatible servers
- Ollama (`http://localhost:11434`)
- LM Studio (OpenAI-compatible, typically `http://localhost:1234/v1`)
- vLLM (OpenAI-compatible)

### Quick Start

1. Open `index.html` in Chrome/Edge/Safari.
2. In **API Configuration**, choose backend type.
3. Fill in API URL / API Key and click **Test Connection**.
4. Select a model.
5. Click **Start Camera**.
6. Click **Start Inference**.

### Backend Configuration

#### OpenAI Official API

- Backend Type: `OpenAI Compatible`
- API URL: `https://api.openai.com/v1`
- API Key: your OpenAI key (`sk-...`)
- Model: a vision-capable model (example: `gpt-4o-mini`)

#### Ollama

- Backend Type: `Ollama`
- API URL: `http://localhost:11434`
- API Key: leave empty
- Model: your local vision model (example: `llava`)

#### LM Studio

- Backend Type: `OpenAI Compatible`
- API URL: usually `http://localhost:1234/v1`
- API Key: optional (depends on your LM Studio server settings)
- Model: the model name loaded in LM Studio


### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Start/Stop inference |
| `C` | Toggle camera |
| `S` | Take screenshot |
| `L` | Clear results |
| `Shift+D` | Toggle debug panel |
| `Esc` | Stop inference |

### API Endpoints Used

- OpenAI-compatible: `GET /models`, `POST /chat/completions`
- Ollama: `GET /api/tags`, `POST /api/chat`

### CORS Notes

If browser requests are blocked by CORS, configure your backend CORS policy or use a local proxy during development.

### Browser Support

- Chrome (recommended)
- Edge
- Firefox 
- Safari