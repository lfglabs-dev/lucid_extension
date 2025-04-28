/**
 * Shows a transaction modal in the center of the screen
 * @param title - The title of the modal
 * @param body - The body text of the modal
 */
export function showTransactionModal(title: string, body: string): void {
  try {
    // Create modal container if it doesn't exist
    let modalContainer = document.getElementById('lucid-modal-container');
    
    // Base64 encoded SVG of Lucid logo
    const logoDataUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHJ4PSIyNCIgZmlsbD0iIzAwN0FGRiIvPjxwYXRoIGQ9Ik00MCAzNlY5Mkg4OFY4MEg1MlYzNkg0MFoiIGZpbGw9IndoaXRlIi8+PC9zdmc+';

    if (!modalContainer) {
      modalContainer = document.createElement('div');
      modalContainer.id = 'lucid-modal-container';

      // Add click outside listener
          modalContainer.addEventListener('click', event => {
            if (event.target === modalContainer) {
              hideTransactionModal();
            }
          });

      document.body.appendChild(modalContainer);
    }

    // Create modal element
    const modal = document.createElement('div');
    modal.id = 'lucid-transaction-modal';
    modal.className = 'lucid-modal';

    // Set content
    modal.innerHTML = `
          <div class="lucid-modal-content">
            <div class="lucid-modal-logo">
              <img src="${logoDataUrl}" alt="Lucid Logo" width="64" height="64" />
            </div>
            <h2 class="lucid-modal-title">${title}</h2>
            <p class="lucid-modal-body">${body}</p>
          </div>
        `;

    // Add to container
    modalContainer.appendChild(modal);

    // Add styles if not already added
    if (!document.getElementById('lucid-modal-styles')) {
      const styleElement = document.createElement('style');
      styleElement.id = 'lucid-modal-styles';
      styleElement.textContent = `
            #lucid-modal-container {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 999999;
              background-color: rgba(0, 0, 0, 0.5);
              animation: fadeIn 0.3s ease-out;
              cursor: pointer;
            }
            .lucid-modal {
              background-color: white;
              border-radius: 12px;
              box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
              padding: 24px;
              width: 90%;
              max-width: 400px;
              animation: scaleIn 0.3s ease-out;
              cursor: default;
            }
            .lucid-modal-content {
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
            }
            .lucid-modal-logo {
              margin-bottom: 16px;
            }
            .lucid-modal-logo img {
              width: 64px;
              height: 64px;
              object-fit: contain;
            }
            .lucid-modal-title {
              color: #007aff;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              font-size: 20px;
              font-weight: 600;
              margin: 0 0 12px 0;
            }
            .lucid-modal-body {
              color: #333;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              font-size: 16px;
              line-height: 1.5;
              margin: 0;
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes scaleIn {
              from { transform: scale(0.9); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
            @keyframes fadeOut {
              from { opacity: 1; }
              to { opacity: 0; }
            }
          `;
      document.head.appendChild(styleElement);
    }
  } catch (error) {
    console.error('[Lucid] Error showing transaction modal:', error);
  }
}

/**
 * Hides the transaction modal
 */
export function hideTransactionModal(): void {
  try {
    const modalContainer = document.getElementById('lucid-modal-container');
    if (modalContainer) {
      modalContainer.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => {
        if (modalContainer.parentNode) {
          modalContainer.parentNode.removeChild(modalContainer);
        }
      }, 300);
    }
  } catch (error) {
    console.error('[Lucid] Error hiding transaction modal:', error);
  }
}