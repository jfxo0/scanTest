// DOM elements
const video = document.getElementById('cameraView');
const canvas = document.getElementById('photoCanvas');
const captureBtn = document.getElementById('captureBtn');
const retakeBtn = document.getElementById('retakeBtn');
const sendBtn = document.getElementById('sendBtn');
const photoPreview = document.getElementById('photoPreview');
const previewImage = document.getElementById('previewImage');
const resultDiv = document.getElementById('result');
const loadingDiv = document.getElementById('loading');

let stream = null;

// Start de camera
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        video.srcObject = stream;
    } catch (err) {
        console.error('Fout bij toegang camera:', err);
        alert('Kon geen toegang krijgen tot de camera. Controleer uw toestemmingen en zorg dat u HTTPS gebruikt.');
    }
}

// Maak een foto
captureBtn.addEventListener('click', function() {
    const context = canvas.getContext('2d');

    // Stel canvas grootte in op video grootte
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Teken het huidige video frame op het canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Toon de preview
    previewImage.src = canvas.toDataURL('image/jpeg');
    photoPreview.classList.remove('hidden');
    captureBtn.classList.add('hidden');

    // Stop de camera
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
});

// Opnieuw proberen
retakeBtn.addEventListener('click', function() {
    photoPreview.classList.add('hidden');
    resultDiv.classList.add('hidden');
    captureBtn.classList.remove('hidden');
    resultDiv.innerHTML = '';
    startCamera();
});

// Verstuur foto direct naar Plant.id API
sendBtn.addEventListener('click', async function() {
    loadingDiv.classList.remove('hidden');
    photoPreview.classList.add('hidden');
    sendBtn.disabled = true;

    try {
        // Converteer canvas naar blob
        canvas.toBlob(async function(blob) {
            try {
                // Controleer of API key is ingesteld
                if (!PLANT_ID_API_KEY || PLANT_ID_API_KEY === 'JOUW_API_KEY_HIER') {
                    throw new Error('API key niet ingesteld. Vul je Plant.id API key in config.js in.');
                }

                // Converteer blob naar base64
                const base64Image = await blobToBase64(blob);

                // Verwijder data:image/jpeg;base64, prefix
                const base64Data = base64Image.split(',')[1];

                // Maak request data volgens Plant.id API specificatie
                const requestData = {
                    images: [base64Data],
                    similar_images: true,
                    health: 'all',
                    language: 'nl'
                };

                console.log('Sending request to Plant.id API...');

                // Verstuur direct naar Plant.id API
                const response = await fetch(PLANT_ID_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Api-Key': PLANT_ID_API_KEY
                    },
                    body: JSON.stringify(requestData)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const data = await response.json();
                console.log('API response received');

                loadingDiv.classList.add('hidden');
                resultDiv.classList.remove('hidden');
                sendBtn.disabled = false;

                // Verwerk de response
                processApiResponse(data);

            } catch (error) {
                console.error('Fout bij API call:', error);
                showError('API Fout', error.message);
                sendBtn.disabled = false;
            }
        }, 'image/jpeg', 0.8);

    } catch (error) {
        console.error('Fout:', error);
        showError('Er ging iets mis', error.message);
        sendBtn.disabled = false;
    }
});

// Hulpfunctie: Converteer blob naar base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Verwerk API response
function processApiResponse(data) {
    if (data.result && data.result.classification && data.result.classification.suggestions) {
        const suggestions = data.result.classification.suggestions;

        if (suggestions.length > 0) {
            const suggestion = suggestions[0];

            const plantName = suggestion.name || 'Onbekend';
            const probability = suggestion.probability || 0;

            let commonNames = 'Onbekend';
            if (suggestion.details && suggestion.details.common_names) {
                commonNames = suggestion.details.common_names.join(', ');
            }

            let wikiDescription = '';
            if (suggestion.details && suggestion.details.description && suggestion.details.description.value) {
                wikiDescription = suggestion.details.description.value;
            }

            // Toon similar images indien beschikbaar
            let similarImagesHtml = '';
            if (suggestion.similar_images && suggestion.similar_images.length > 0) {
                similarImagesHtml = `
                    <div class="similar-images">
                        <p><strong>🔍 Vergelijkbare afbeeldingen:</strong></p>
                        ${suggestion.similar_images.slice(0, 5).map(img => `
                            <img src="${img.url}" class="similar-image" 
                                 title="${img.citation || 'Similar image'}" 
                                 onclick="window.open('${img.url}', '_blank')">
                        `).join('')}
                    </div>
                `;
            }

            // Toon gezondheidsinfo indien beschikbaar
            let healthHtml = '';
            if (data.result.disease && data.result.disease.suggestions && data.result.disease.suggestions.length > 0) {
                const disease = data.result.disease.suggestions[0];
                healthHtml = `<p><strong>🌱 Gezondheid:</strong> ${disease.name || 'Onbekend'} (${Math.round((disease.probability || 0) * 100)}%)</p>`;
            }

            resultDiv.innerHTML = `
                <h2>🌿 Scan Resultaat</h2>
                <div class="plant-info">
                    <p><strong>🔬 Wetenschappelijke naam:</strong> ${plantName}</p>
                    <p><strong>🎯 Nauwkeurigheid:</strong> ${Math.round(probability * 100)}%</p>
                    <p><strong>🇳🇱 Nederlandse naam:</strong> ${commonNames}</p>
                    ${healthHtml}
                    ${wikiDescription ? `
                        <p><strong>📖 Beschrijving:</strong><br>
                        ${wikiDescription.substring(0, 250)}...</p>
                    ` : ''}
                    ${similarImagesHtml}
                </div>
                <button onclick="location.reload()" class="btn">🔄 Nieuwe scan</button>
            `;
        } else {
            throw new Error('Geen plant herkend in de foto');
        }
    } else {
        throw new Error('Ongeldige response van Plant.id API');
    }
}

// Toon error message
function showError(title, message) {
    loadingDiv.classList.add('hidden');
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `
        <div class="error">
            <h3>❌ ${title}</h3>
            <p>${message}</p>
            <p><small>Controleer je API key en internet verbinding</small></p>
            <button onclick="location.reload()" class="btn">🔄 Probeer opnieuw</button>
        </div>
    `;
}

// Start de camera wanneer de pagina laadt
window.addEventListener('load', function() {
    if (window.location.protocol !== 'https:') {
        alert('⚠️ Deze website vereist HTTPS voor camera toegang. Gelieve te gebruiken via HTTPS.');
    }

    if (!PLANT_ID_API_KEY || PLANT_ID_API_KEY === 'JOUW_API_KEY_HIER') {
        alert('⚠️ Vergeet niet je Plant.id API key in config.js in te vullen!');
    }

    startCamera();
});