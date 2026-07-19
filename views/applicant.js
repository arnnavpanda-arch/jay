/**
 * applicant.js
 * Logic for the applicant portal
 */

const applicantView = {
    async submitApplication(e) {
        e.preventDefault();
        
        const role = document.getElementById('app-role').value;
        let specificRole = role;
        
        if (role === 'Manager') {
            specificRole = document.getElementById('app-track').value;
        }

        const name = document.getElementById('app-name').value;
        const mobile = document.getElementById('app-mobile').value;
        const email = document.getElementById('app-email').value;

        // Collect extra details based on role (dynamically from all inputs inside dynamic-fields)
        const details = {};
        const filesToUpload = {};
        const dynamicFields = document.getElementById('dynamic-fields');
        
        // Grab all inputs, selects, and textareas
        const inputs = dynamicFields.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (input.id) {
                const key = input.id.replace('app-', '');
                if (input.type === 'file' && input.files.length > 0) {
                    filesToUpload[key] = input.files[0];
                } else if (input.type !== 'file' && input.value) {
                    details[key] = input.value;
                }
            }
        });

        const applicantId = Store.generateApplicantId();
        const firstName = name.split(' ')[0].toLowerCase();
        const password = firstName + '@123';

        const application = {
            appId: applicantId, // Changed to appId to match the backend expectation
            id: applicantId, // Keep for legacy frontend access
            password: password,
            name,
            mobile,
            email,
            role: specificRole,
            details,
            status: 'Submitted',
            stage: 'Stage 1 Completed',
            date: new Date().toISOString()
        };

        await Store.saveApplication(application, filesToUpload);

        // Show credentials to user (mocking email/SMS)
        alert(`Application Submitted Successfully!\n\nYour Applicant ID: ${applicantId}\nYour Password: ${password}\n\nPlease save these credentials to check your status.`);
        
        app.navigate('home');
        e.target.reset();
    },

    async login(e) {
        e.preventDefault();
        const id = document.getElementById('login-app-id').value;
        const pass = document.getElementById('login-app-pass').value;

        const application = await Store.getApplicationByCredentials(id, pass);
        
        if (application) {
            app.currentUser = { type: 'applicant', data: application };
            e.target.reset();
            app.navigate('applicant-dashboard');
            app.showToast('Login successful');
        } else {
            alert("Invalid Applicant ID or Password");
        }
    },

    lastAppHash: null,

    async refreshDashboard(isBackgroundSync = false) {
        if (!app.currentUser || app.currentUser.type !== 'applicant') return;
        
        // Always fetch fresh from store
        const application = await Store.getApplicationById(app.currentUser.data.id || app.currentUser.data.appId);
        if (!application) return;
        
        // Hash check to prevent flickering
        const currentHash = JSON.stringify(application);
        if (isBackgroundSync && currentHash === this.lastAppHash) {
            return;
        }
        this.lastAppHash = currentHash;

        app.currentUser.data = application;

        document.getElementById('dash-app-name').innerText = application.name;
        document.getElementById('dash-app-id').innerText = application.id || application.appId;
        document.getElementById('dash-app-role').innerText = application.role;
        document.getElementById('dash-app-stage').innerText = application.stage;

        const statusEl = document.getElementById('dash-app-status');
        statusEl.innerText = application.status;
        statusEl.className = 'badge'; // reset
        
        if (application.status === 'Submitted') statusEl.classList.add('badge-submitted');
        if (application.status === 'Pending Review' || application.status === 'Under Verification') statusEl.classList.add('badge-pending');
        if (application.status === 'Approved' || application.status === 'Selected') statusEl.classList.add('badge-approved');
        if (application.status === 'Rejected') statusEl.classList.add('badge-rejected');

        // Populate Submitted Details
        const detailsContainer = document.getElementById('dash-app-details');
        detailsContainer.innerHTML = '';
        
        // Add base details
        const allDetails = {
            'Email': application.email,
            'Mobile': application.mobile,
            ...(application.details || {})
        };

        for (const [key, value] of Object.entries(allDetails)) {
            // Format the key to be more readable (e.g., 'dl-upload' -> 'Dl Upload')
            const formattedKey = key.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            
            let displayValue = value;
            if (value && typeof value === 'string' && value.startsWith('/uploads/')) {
                displayValue = `<a href="${value}" target="_blank" style="color: #60a5fa; text-decoration: underline;">View File</a>`;
            }

            detailsContainer.innerHTML += `
                <div>
                    <p class="label" style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">${formattedKey}</p>
                    <p class="value" style="font-weight: 500; word-break: break-word;">${displayValue}</p>
                </div>
            `;
        }

        this.renderActions(application);
    },

    renderActions(appData) {
        const actionsDiv = document.getElementById('applicant-actions');
        actionsDiv.innerHTML = '';

        if (appData.status === 'Approved' && appData.stage !== 'Selected') {
            actionsDiv.innerHTML = `
                <div class="glass-card">
                    <h3>Stage 2 Verification</h3>
                    <p>Your application has been approved. Please verify your details for final review.</p>
                    <button class="btn-primary mt-4" onclick="applicantView.confirmVerification()">Confirm Information Accurate</button>
                </div>
            `;
        } else if (appData.status === 'Selected') {
            const rDate = appData.reportingDate ? new Date(appData.reportingDate).toLocaleDateString() : 'TBD';
            const rTime = appData.reportingTime || 'TBD';
            
            actionsDiv.innerHTML = `
                <div class="glass-card" style="background: rgba(16, 185, 129, 0.1); border-color: #10b981;">
                    <h3 style="color: #10b981;">Congratulations!</h3>
                    <p>You have been selected for Document Verification.</p>
                    <div style="margin-top: 1rem; padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 0.5rem;">
                        <p style="margin-bottom: 0.5rem;"><strong>Reporting Details:</strong></p>
                        <p><strong>Venue:</strong> ${appData.verificationVenue || 'Agency Head Office'}</p>
                        <p><strong>Date:</strong> ${rDate}</p>
                        <p><strong>Time:</strong> ${rTime}</p>
                    </div>
                    <button class="btn-primary mt-4" style="background: #10b981;" onclick="applicantView.printOfferLetter()">Download Offer Letter</button>
                </div>
            `;
        }
    },

    async printOfferLetter() {
        if (!app.currentUser || app.currentUser.type !== 'applicant') return;
        const appData = app.currentUser.data;
        const settings = await Store.getSettings();

        // Populate Org Info
        document.getElementById('ol-org-name').innerText = settings.orgName || '[Organization/Company Name]';
        document.getElementById('ol-org-name-bottom').innerText = settings.orgName || '[Organization/Company Name]';
        document.getElementById('ol-org-address').innerText = `Address: ${settings.orgAddress || '________________________________'}`;
        document.getElementById('ol-org-phone').innerText = `Phone: ${settings.orgPhone || '________________________________'}`;
        document.getElementById('ol-org-email').innerText = `Email: ${settings.orgEmail || '________________________________'}`;

        // Populate Candidate Info
        document.getElementById('ol-no').innerText = appData.id || appData.appId;
        document.getElementById('ol-date').innerText = new Date().toLocaleDateString();
        document.getElementById('ol-name').innerText = appData.name;
        document.getElementById('ol-app-id').innerText = appData.id || appData.appId;
        document.getElementById('ol-post').innerText = appData.role;
        document.getElementById('ol-mobile').innerText = appData.mobile;
        document.getElementById('ol-email').innerText = appData.email;
        document.getElementById('ol-gender').innerText = appData.details?.gender || appData.details?.Gender || 'N/A';
        document.getElementById('ol-dob').innerText = appData.details?.dob || appData.details?.['Date Of Birth'] || 'N/A';
        document.getElementById('ol-res-address').innerText = appData.details?.address || appData.details?.['Residential Address'] || 'N/A';

        // Populate Verification Info
        const rDate = appData.reportingDate ? new Date(appData.reportingDate).toLocaleDateString() : '____ / ____ / ______';
        document.getElementById('ol-ver-date').innerText = rDate;
        document.getElementById('ol-ver-time').innerText = appData.reportingTime || '____________';
        document.getElementById('ol-ver-venue').innerText = appData.verificationVenue || 'Agency Head Office';

        // Show the view
        document.querySelectorAll('.view, main > section').forEach(el => {
            el.classList.add('hidden');
            el.classList.remove('active');
        });
        const olView = document.getElementById('offer-letter-view');
        olView.classList.remove('hidden');
        setTimeout(() => olView.classList.add('active'), 50);
        window.scrollTo(0,0);
    },

    async confirmVerification() {
        if (!app.currentUser || app.currentUser.type !== 'applicant') return;
        
        const appId = app.currentUser.data.id || app.currentUser.data.appId;
        const updated = await Store.updateApplication(appId, {
            status: 'Pending Verification',
            stage: 'Stage 2 Verification'
        });
        
        if (updated) {
            app.showToast('Verification Submitted successfully');
            await this.refreshDashboard();
        }
    }
};
