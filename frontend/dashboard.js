// =====================================
// SKILLBRIDGE DASHBOARD
// =====================================

const API_URL = "https://skillbridge-api-lsys.onrender.com";


// =====================================
// CHECK LOGIN
// =====================================

const token = localStorage.getItem("access_token");

const student = JSON.parse(
    localStorage.getItem("student") || "null"
);

if (!token || !student) {
    window.location.href = "index.html";
}


// =====================================
// STUDENT INFORMATION
// =====================================

if (student) {

    const firstLetter = student.name.charAt(0).toUpperCase();

    document.getElementById("welcomeName").textContent =
        student.name.split(" ")[0];

    document.getElementById("sidebarName").textContent =
        student.name;

    document.getElementById("sidebarEmail").textContent =
        student.email;

    document.getElementById("sidebarAvatar").textContent =
        firstLetter;

    document.getElementById("topbarAvatar").textContent =
        firstLetter;
}


// =====================================
// CURRENT DATE
// =====================================

document.getElementById("currentDate").textContent =
    new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });


// =====================================
// SIDEBAR NAVIGATION
// =====================================

const navigationItems = document.querySelectorAll(".nav-item");

const pages = document.querySelectorAll(".content-page");

const pageTitle = document.getElementById("pageTitle");

const pageNames = {
    dashboard: "Dashboard",
    analysis: "Skill Analysis",
    resources: "Learning Resources",
    progress: "My Progress",
    internships: "Internships",
    profile: "My Profile",
    settings: "Settings"
};

function showPage(pageName) {

    pages.forEach(page => {
        page.classList.remove("active");
    });

    navigationItems.forEach(item => {
        item.classList.remove("active");
    });

    const selectedPage = document.getElementById(pageName + "Page");

    if (selectedPage) {
        selectedPage.classList.add("active");
    }

    const selectedNav = document.querySelector(
        `[data-page="${pageName}"]`
    );

    if (selectedNav) {
        selectedNav.classList.add("active");
    }

    pageTitle.textContent = pageNames[pageName] || "Dashboard";

    if (pageName === "resources") {
        loadLearningResources();
    }

    if (pageName === "progress") {
        loadMyProgress();
    }
}
// ======================================
// MY PROGRESS
// ======================================

async function loadMyProgress() {
    const progressContent = document.getElementById("progressContent");
    const token = localStorage.getItem("access_token");
    const roleId = localStorage.getItem("selected_role_id");

    if (!roleId) {
        progressContent.innerHTML = '<div class="panel"><h3>No career selected</h3><p>Complete your Skill Analysis first.</p><button class="primary-button" onclick="showPage(\'analysis\')">Start Skill Analysis →</button></div>';
        return;
    }
    if (!token) {
        progressContent.innerHTML = '<div class="panel"><h3>Your session has expired</h3><p>Please log in again to view your learning progress.</p></div>';
        return;
    }

    progressContent.innerHTML = "<p>Loading your progress...</p>";
    try {
        let response = await fetch(`${API_URL}/progress/${encodeURIComponent(roleId)}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        let data;
        if (response.ok) {
            data = await response.json();
        } else if (response.status === 401) {
            throw new Error("Your session has expired. Please log in again.");
        } else {
            const fallback = await fetch(`${API_URL}/dashboard/${encodeURIComponent(roleId)}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (fallback.status === 401) throw new Error("Your session has expired. Please log in again.");
            if (!fallback.ok) throw new Error("Progress is not available yet. Run Skill Analysis first.");
            const summary = await fallback.json();
            const groups = summary.skills || {};
            const skills = [...(groups.completed || []), ...(groups.in_progress || []), ...(groups.not_started || [])];
            const total = skills.length;
            const overall = total ? skills.reduce((sum, skill) => sum + Number(skill.progress || 0), 0) / total : 0;
            data = { role_id: Number(roleId), total_skills: total, overall_progress: Number(overall.toFixed(2)), skills };
        }
        displayMyProgress(data);
    } catch (error) {
        console.error("Progress loading failed:", error);
        progressContent.innerHTML = '<div class="panel"><h3>Unable to load progress</h3><p>' + escapeHTML(error.message || "Please try again.") + '</p><button class="primary-button" onclick="loadMyProgress()">Try Again →</button></div>';
    }
}

function displayMyProgress(data) {

    const progressContent = document.getElementById("progressContent");

    const skills = data.skills || [];

    const completed = skills.filter(skill => Number(skill.progress) >= 100).length;
    const inProgress = skills.filter(skill => Number(skill.progress) > 0 && Number(skill.progress) < 100).length;
    const notStarted = skills.filter(skill => Number(skill.progress) <= 0).length;

    progressContent.innerHTML = `

        <div class="progress-overview">

            <div class="progress-card">
                <span>Overall Progress</span>
                <h2>${data.overall_progress}%</h2>
            </div>

            <div class="progress-card">
                <span>Total Skills</span>
                <h2>${data.total_skills}</h2>
            </div>

            <div class="progress-card">
                <span>Completed</span>
                <h2>${completed}</h2>
            </div>

            <div class="progress-card">
                <span>In Progress</span>
                <h2>${inProgress}</h2>
            </div>

            <div class="progress-card">
                <span>Not Started</span>
                <h2>${notStarted}</h2>
            </div>

       </div>

        <div class="panel overall-progress-panel">
            <div class="overall-progress-heading">
                <div>
                    <span class="progress-label">YOUR LEARNING JOURNEY</span>
                    <h2>Overall Learning Progress</h2>
                    <p>Keep going! Every completed skill brings you closer to your career goal.</p>
                </div>
                <strong>${Number(data.overall_progress).toFixed(2)}%</strong>
            </div>

            <div class="overall-progress-track">
                <div class="overall-progress-fill"
                     style="width:${Math.min(100, Math.max(0, Number(data.overall_progress) || 0))}%">
                </div>
            </div>
        </div>

        <div class="panel skill-progress-panel">
            <h2>Learning Status Overview</h2>
            <div class="progress-status-chart">
                <div><span class="status-dot completed-dot"></span>Completed <strong>${completed}</strong></div>
                <div class="status-track"><span class="status-fill completed-fill" style="width:${skills.length ? completed / skills.length * 100 : 0}%"></span></div>
                <div><span class="status-dot learning-dot"></span>In Progress <strong>${inProgress}</strong></div>
                <div class="status-track"><span class="status-fill learning-fill" style="width:${skills.length ? inProgress / skills.length * 100 : 0}%"></span></div>
                <div><span class="status-dot pending-dot"></span>Not Started <strong>${notStarted}</strong></div>
                <div class="status-track"><span class="status-fill pending-fill" style="width:${skills.length ? notStarted / skills.length * 100 : 0}%"></span></div>
            </div>
        </div>

        <div class="panel skill-progress-panel">

            <h2>Skill-wise Progress</h2>

            <p>Track your learning journey skill by skill.</p>

            <div id="individualSkillProgress"></div>

        </div>
    `;

    const individualSkillProgress =
        document.getElementById("individualSkillProgress");

    skills.forEach(skill => {

        const percentage = Math.max(0, Math.min(100, Number(skill.progress) || 0));
        const skillName = String(skill.skill_name || "Unnamed skill");
        const displayName = skillName.replace(
            /\b\w/g,
            char => char.toUpperCase()
        );

        const skillItem = document.createElement("div");

        skillItem.className = "individual-skill";

        skillItem.innerHTML = `

            <div class="skill-progress-header">

                <h3>${escapeHTML(displayName)}</h3>

                <span>${percentage}%</span>

            </div>

            <div class="progress-track">

                <div class="progress-fill"
                    style="width: ${percentage}%;">
                </div>

            </div>

            <div class="skill-progress-footer">

                <span>
                    ${
                        percentage === 100
                        ? "Completed"
                        : percentage === 0
                        ? "Not Started"
                        : "In Progress"
                    }
                </span>

                <select class="progress-select"
                    data-skill="${escapeHTML(skillName)}">

                    <option value="0" ${percentage === 0 ? "selected" : ""}>0%</option>

                    <option value="25" ${percentage === 25 ? "selected" : ""}>25%</option>

                    <option value="50" ${percentage === 50 ? "selected" : ""}>50%</option>

                    <option value="75" ${percentage === 75 ? "selected" : ""}>75%</option>

                    <option value="100" ${percentage === 100 ? "selected" : ""}>100%</option>

                </select>

            </div>

        `;

        individualSkillProgress.appendChild(skillItem);

    });

    // Progress update event

    document.querySelectorAll(".progress-select").forEach(select => {

        select.addEventListener("change", async function () {

            await updateSkillProgress(
                this.dataset.skill,
                Number(this.value)
            );

        });

    });

}


// ======================================
// UPDATE SKILL PROGRESS
// ======================================
async function updateSkillProgress(skillName, percentage) {

    const token = localStorage.getItem("access_token");
    const roleId = localStorage.getItem("selected_role_id");

    try {

        const response = await fetch(
            `${API_URL}/progress/update`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    role_id: Number(roleId),
                    skill_name: skillName,
                    progress_percentage: percentage
                })
            }
        );

        if (!response.ok) {
            throw new Error("Progress update failed.");
        }

        await loadMyProgress();

    } catch (error) {

        console.error(error);

        alert("Unable to update progress. Please try again.");

        await loadMyProgress();
    }
}
// Sidebar clicks

navigationItems.forEach(item => {

    item.addEventListener("click", function (event) {

        event.preventDefault();

        showPage(this.dataset.page);

    });

});


// Dashboard buttons

document.querySelectorAll("[data-go]").forEach(button => {

    button.addEventListener("click", function () {

        showPage(this.dataset.go);

    });

});


// =====================================
// HTML SAFETY
// =====================================

function escapeHTML(value) {

    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);

}


// =====================================
// SKILL ANALYSIS
// =====================================

const savedSkills = localStorage.getItem("entered_student_skills") || "";
const skillsInputElement = document.getElementById("studentSkills");
if (skillsInputElement && savedSkills) skillsInputElement.value = savedSkills;

// =====================================
// LOAD JOB ROLES
// =====================================
// =====================================
// LOAD CATEGORIES AND JOB ROLES
// =====================================
// =====================================
// LOAD CATEGORIES AND JOB ROLES
// =====================================

let allRoles = [];

async function loadJobRoles() {

    const categorySelect = document.getElementById("categorySelect");
    const careerSelect = document.getElementById("careerSelect");
    const message = document.getElementById("analysisMessage");

    try {

        categorySelect.innerHTML =
            `<option value="">Loading categories...</option>`;

        careerSelect.innerHTML =
            `<option value="">Select a category first</option>`;

        careerSelect.disabled = true;

        // Fetch all available job roles
        const response = await fetch(`${API_URL}/roles`);

        if (!response.ok) {
            throw new Error("Failed to fetch job roles.");
        }

        const data = await response.json();

        if (!data.roles || !Array.isArray(data.roles)) {
            throw new Error("Invalid job roles data received.");
        }

        allRoles = data.roles;

        // Attach bundled skill requirements as a backup even when the live
        // role endpoint responds but an older backend build is still deployed.
        try {
            const backupResponse = await fetch("role_fallback.json");
            if (backupResponse.ok) {
                const backupData = await backupResponse.json();
                const backupByName = new Map(
                    (backupData.roles || []).map(role => [String(role.job_role).toLowerCase(), role.required_skills || []])
                );
                allRoles.forEach(role => {
                    if (!Array.isArray(role.required_skills) || !role.required_skills.length) {
                        role.required_skills = backupByName.get(String(role.job_role).toLowerCase()) || [];
                    }
                });
            }
        } catch (backupError) {
            console.warn("Bundled skill backup could not be loaded:", backupError);
        }

        // Extract unique categories
        const categories = [
            ...new Set(
                allRoles
                    .map(role => role.sector)
                    .filter(Boolean)
            )
        ].sort();

        // Populate category dropdown
        categorySelect.innerHTML =
            `<option value="">Choose a career category</option>`;

        categories.forEach(category => {

            const option = document.createElement("option");

            option.value = category;
            option.textContent = category;

            categorySelect.appendChild(option);

        });

        // Restore previously selected role
        const savedRoleId = localStorage.getItem("selected_role_id");

        if (savedRoleId) {

            const savedRole = allRoles.find(
                role => String(role.role_id) === String(savedRoleId)
            );

            if (savedRole) {

                categorySelect.value = savedRole.sector;

                updateCareerOptions(savedRole.sector);

                careerSelect.value = String(savedRoleId);

            }

        }

        console.log("Categories loaded:", categories);
        console.log("Job roles loaded:", allRoles.length);

    } catch (error) {

        console.error("Live role list unavailable; loading bundled demo catalogue:", error);

        try {
            const fallbackResponse = await fetch("role_fallback.json");
            if (!fallbackResponse.ok) throw new Error("Bundled role catalogue unavailable.");
            const fallbackData = await fallbackResponse.json();
            allRoles = Array.isArray(fallbackData.roles) ? fallbackData.roles : [];
            if (!allRoles.length) throw new Error("Bundled role catalogue is empty.");

            const categories = [...new Set(allRoles.map(role => role.sector).filter(Boolean))].sort();
            categorySelect.innerHTML = '<option value="">Choose a career category</option>';
            categories.forEach(category => {
                const option = document.createElement("option");
                option.value = category;
                option.textContent = category;
                categorySelect.appendChild(option);
            });

            careerSelect.innerHTML = '<option value="">Choose a target job role</option>';
            careerSelect.disabled = true;
            if (message) {
                message.textContent = "Using the built-in role catalogue while the server reconnects. Analysis will run as a local preview.";
            }
        } catch (fallbackError) {
            console.error("Bundled role catalogue failed:", fallbackError);
            categorySelect.innerHTML = '<option value="">Unable to load categories</option>';
            careerSelect.innerHTML = '<option value="">Unable to load job roles</option>';
            if (message) message.textContent = "Could not load the role catalogue. Refresh the page and try again.";
        }

    }
}


// =====================================
// FILTER JOB ROLES BY CATEGORY
// =====================================

function updateCareerOptions(selectedCategory) {

    const careerSelect = document.getElementById("careerSelect");

    careerSelect.innerHTML =
        `<option value="">Choose your target job role</option>`;

    const filteredRoles = allRoles.filter(
        role => role.sector === selectedCategory
    );

    filteredRoles.forEach(role => {

        const option = document.createElement("option");

        option.value = role.role_id;
        option.textContent = role.job_role;

        careerSelect.appendChild(option);

    });

    careerSelect.disabled = filteredRoles.length === 0;

}


// =====================================
// CATEGORY CHANGE EVENT
// =====================================

document.getElementById("categorySelect")
    .addEventListener("change", function () {

        updateCareerOptions(this.value);

    });
// =====================================
// ANALYSE SKILLS
// =====================================

document.getElementById("analyzeSkillsButton").addEventListener(
    "click",
    async function () {

        const roleId = document.getElementById("careerSelect").value;

        const skillsInput = document.getElementById("studentSkills").value;

        const message = document.getElementById("analysisMessage");

        const results = document.getElementById("analysisResults");

        const button = this;
        const token = localStorage.getItem("access_token");
        if (!token) {
        message.textContent = "Your session has expired. Please log in again.";
        return;
        }


        // Validation

        if (!roleId) {

            message.textContent = "Please select a target job role.";

            return;

        }

        if (!skillsInput.trim()) {

            message.textContent = "Please enter at least one existing skill.";

            return;

        }


        const studentSkills = skillsInput
            .split(",")
            .map(skill => skill.trim())
            .filter(skill => skill.length > 0);


        button.disabled = true;

        button.textContent = "Analysing...";

        message.textContent = "Comparing your skills with job requirements...";

        results.innerHTML = "";


        try {

            const response = await fetch(
        `${API_URL}/analyze-skills`,
        {
        method: "POST",

        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },

        body: JSON.stringify({
            role_id: Number(roleId),
            student_skills: studentSkills
        })
    }
);

            const data = await response.json();

            if (!response.ok) {
                const requestError = new Error(data.detail || "Skill analysis failed.");
                requestError.allowOfflineFallback = response.status === 401 || response.status >= 500;
                throw requestError;
            }


            // Save selected career
            localStorage.setItem(
                "selected_role_id",
                String(roleId)
            );

            // Display results
            displayAnalysisResults(data);
            message.textContent =
                "Your skill analysis is complete!";
        }

        catch (error) {
            console.error("Skill analysis request failed:", error);

            // Keep the core demo usable during Render cold starts or temporary
            // network/auth failures. This preview is calculated from the real
            // role-skill list already loaded from the API and is not saved.
            if (error instanceof TypeError || error.allowOfflineFallback) {
                const selectedRole = allRoles.find(
                    role => String(role.role_id) === String(roleId)
                );
                const requiredSkills = selectedRole?.required_skills || [];

                if (selectedRole && requiredSkills.length) {
                    const normalize = value => {
                        const aliases = {
                            "py": "python",
                            "python programming": "python",
                            "ms excel": "excel",
                            "microsoft excel": "excel",
                            "mysql": "sql",
                            "postgresql": "sql",
                            "powerbi": "power bi",
                            "ml": "machine learning",
                            "ai": "artificial intelligence",
                            "js": "javascript",
                            "react.js": "react",
                            "react js": "react",
                            "node.js": "nodejs",
                            "html5": "html",
                            "css3": "css"
                        };
                        const key = String(value || "").trim().toLowerCase().replace(/\\s+/g, " ");
                        return aliases[key] || key.replace(/[^a-z0-9+#]+/g, " ").trim();
                    };

                    const entered = new Set(studentSkills.map(normalize));
                    const matched = [];
                    const missing = [];

                    requiredSkills.forEach(item => {
                        const requirement = String(item || "").trim();
                        const alternatives = requirement.split(/\\s+or\\s+/i);
                        const found = alternatives.some(part => entered.has(normalize(part)));
                        (found ? matched : missing).push(requirement.toLowerCase());
                    });

                    const total = matched.length + missing.length;
                    const preview = {
                        role_id: Number(roleId),
                        job_role: selectedRole.job_role,
                        sector: selectedRole.sector,
                        matched_skills: matched.sort(),
                        missing_skills: missing.sort(),
                        match_percentage: total ? Math.round((matched.length / total) * 10000) / 100 : 0,
                        learning_plan: {},
                        offline_preview: true
                    };

                    displayAnalysisResults(preview);
                    message.textContent = "Offline preview shown. The API could not be reached, so this result has not been saved.";
                } else {
                    message.textContent = "The server is temporarily unavailable and this role has no cached skill list. Please refresh once the server is awake.";
                }
            } else {
                message.textContent = error.message || "Skill analysis failed. Please try again.";
            }
        }

        finally {
            button.disabled = false;
            button.textContent = "Analyse My Skills →";
        }

    }
);


// =====================================
// DISPLAY ANALYSIS RESULTS
// =====================================

function displayAnalysisResults(data) {
    const results = document.getElementById("analysisResults");
    const matchedSkills = Array.isArray(data.matched_skills) ? data.matched_skills : [];
    const missingSkills = Array.isArray(data.missing_skills) ? data.missing_skills : [];
    const percentage = Math.max(0, Math.min(100, Number(data.match_percentage) || 0));
    const totalSkills = Number(data.total_required_skills) || matchedSkills.length + missingSkills.length;
    const enteredSkills = (document.getElementById("studentSkills")?.value || "")
        .split(",").map(skill => skill.trim()).filter(Boolean);

    localStorage.setItem("selected_role_id", String(data.role_id || document.getElementById("careerSelect").value));
    localStorage.setItem("missing_skills", JSON.stringify(missingSkills));
    localStorage.setItem("matched_skills", JSON.stringify(matchedSkills));
    localStorage.setItem("entered_student_skills", enteredSkills.join(", "));
    localStorage.setItem("recently_updated_skills", JSON.stringify(enteredSkills));
    localStorage.setItem("total_required_skills", String(totalSkills));

    const matchedMarkup = matchedSkills.length
        ? matchedSkills.map(skill => `<li class="analysis-skill matched-skill"><span>✓</span>${escapeHTML(skill)}</li>`).join("")
        : '<li class="analysis-empty">No direct matches yet. Add any skills you already know and analyse again.</li>';
    const missingMarkup = missingSkills.length
        ? missingSkills.map(skill => `<li class="analysis-skill missing-skill"><span>＋</span>${escapeHTML(skill)}</li>`).join("")
        : '<li class="analysis-empty">Great work — no required skills are missing for this role.</li>';

    results.innerHTML = `
        <section class="panel analysis-result-card">
            <div class="analysis-result-heading">
                <div>
                    <p class="section-label">YOUR SKILL GAP REPORT</p>
                    <h2>${escapeHTML(data.job_role || "Selected career")}</h2>
                    <p class="analysis-sector">${escapeHTML(data.sector || "Career pathway")}</p>
                </div>
                <div class="match-score"><strong>${percentage.toFixed(1)}%</strong><span>Career match</span></div>
            </div>
            <div class="match-track"><div class="match-fill" style="width:${percentage}%"></div></div>
            <p class="analysis-explanation">${matchedSkills.length} of ${totalSkills} required skills matched. Focus on the skills listed below to strengthen your profile.</p>
            <div class="analysis-skill-columns">
                <div class="analysis-skill-group">
                    <h3>✓ Skills you have <span>${matchedSkills.length}</span></h3>
                    <ul>${matchedMarkup}</ul>
                </div>
                <div class="analysis-skill-group">
                    <h3>＋ Skills to develop <span>${missingSkills.length}</span></h3>
                    <ul>${missingMarkup}</ul>
                </div>
            </div>
            <div class="analysis-next-step">
                <p>Next step</p>
                <span>Use your missing-skill list to explore focused learning resources and track your progress.</span>
                <button type="button" class="primary-button" id="goToResourcesButton">Explore Learning Resources →</button>
            </div>
        </section>`;

    const careerMatch = document.getElementById("careerMatch");
    const careerName = document.getElementById("careerName");
    const careerGoal = document.getElementById("careerGoalName");
    const completedSkills = document.getElementById("completedSkills");
    const learningSkills = document.getElementById("learningSkills");
    const totalSkillsElement = document.getElementById("totalSkills");

    if (careerMatch) careerMatch.textContent = `${percentage.toFixed(1)}%`;
    const selectedRole = document.getElementById("careerSelect")?.selectedOptions?.[0]?.textContent || data.job_role || "Selected career";
    if (careerName) careerName.textContent = selectedRole;
    if (careerGoal) careerGoal.textContent = data.job_role || selectedRole;
    if (completedSkills) completedSkills.textContent = matchedSkills.length;
    if (learningSkills) learningSkills.textContent = missingSkills.length;
    if (totalSkillsElement) totalSkillsElement.textContent = totalSkills;

    const recentSkills = document.getElementById("recentSkills");
    if (recentSkills) {
        recentSkills.innerHTML = enteredSkills.length
            ? `<div class="recent-skills-list">${enteredSkills.map(skill => `<span class="recent-skill-tag"><span class="skill-check">✓</span>${escapeHTML(skill)}</span>`).join("")}</div><p class="recent-skills-note">Your submitted skills are saved with this analysis.</p>`
            : '<p class="empty-skills">No skills added yet.</p>';
    }

    const goButton = document.getElementById("goToResourcesButton");
    if (goButton) goButton.addEventListener("click", () => showPage("resources"));
    results.style.display = "block";
    results.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadSavedStudentAnalysis() {

    const token = localStorage.getItem("access_token");

    if (!token) {
        console.log("No login token found.");
        return null;
    }

    try {
        const response = await fetch(`${API_URL}/student-analysis`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
            
        });
        console.log("Student analysis status:", response.status);

if (!response.ok) {
    console.log(
        "Student analysis error:",
        await response.clone().text()
    );
}

        if (response.status === 401) {
            console.error("Login token expired or invalid. Please log in again.");
            return null;
        }

        if (!response.ok) {
            throw new Error("Unable to load saved analysis.");
        }

        const data = await response.json();

        if (!data.has_analysis) return null;

        localStorage.setItem("selected_role_id", String(data.role_id));
        localStorage.setItem(
            "entered_student_skills",
            (data.student_skills || []).join(", ")
        );

        localStorage.setItem("matched_skills", JSON.stringify(data.matched_skills || []));
        localStorage.setItem("missing_skills", JSON.stringify(data.missing_skills || []));
        localStorage.setItem("recently_updated_skills", JSON.stringify(data.student_skills || []));
        localStorage.setItem("total_required_skills", String(data.total_required_skills || 0));
        localStorage.setItem("saved_match_percentage", String(data.match_percentage || 0));

        return data;

    } catch (error) {
        console.error("Saved analysis loading error:", error);
        return null;
    }
}
async function loadDashboardSummary(roleId, matchPercentage) {
    const token = localStorage.getItem("access_token");
    const careerMatch = document.getElementById("careerMatch");
    const careerName = document.getElementById("careerName");

    if (careerMatch) careerMatch.textContent = `${Number(matchPercentage || 0).toFixed(1)}%`;

    try {
        const response = await fetch(`${API_URL}/dashboard/${roleId}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!response.ok) {
            if (response.status !== 404) throw new Error("Dashboard data could not be loaded.");
            return;
        }
        const data = await response.json();
        const summary = data.learning_summary || {};
        if (careerName) careerName.textContent = data.career?.job_role || "Selected career";
        document.getElementById("completedSkills").textContent = summary.completed_skills ?? 0;
        document.getElementById("learningSkills").textContent = summary.in_progress_skills ?? 0;
        document.getElementById("totalSkills").textContent = summary.total_skills ?? 0;
        if (careerMatch) careerMatch.textContent = `${Number(summary.career_match ?? matchPercentage ?? 0).toFixed(1)}%`;
        const careerGoal = document.getElementById("careerGoalName");
        if (careerGoal) careerGoal.textContent = data.career?.job_role || "Selected career";
    } catch (error) {
        console.error("Dashboard summary:", error);
    }
}

// =====================================
// WEEKLY LEARNING ACTIVITY
// =====================================

function getLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

async function loadWeeklyActivity() {
    const chart = document.getElementById("weeklyActivityChart");
    if (!chart) return;
    const today = new Date();
    const monday = new Date(today);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const startDate = getLocalDateKey(monday);
    const endDate = getLocalDateKey(sunday);
    const token = localStorage.getItem("access_token");
    const message = document.getElementById("weeklyActivityMessage");
    try {
        const response = await fetch(`${API_URL}/learning-activity?start_date=${startDate}&end_date=${endDate}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (response.status === 401) throw new Error("Please log in again to view your activity.");
        if (!response.ok) throw new Error("Activity could not be loaded.");
        const data = await response.json();
        const dayTotals = new Map((data.days || []).map(item => [item.date, Number(item.minutes) || 0]));
        const values = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + index);
            return dayTotals.get(getLocalDateKey(date)) || 0;
        });
        const max = Math.max(30, ...values);
        chart.querySelectorAll(".activity-bar").forEach((bar, index) => {
            const value = values[index] || 0;
            bar.style.height = value ? `${Math.max(5, value / max * 100)}%` : "0%";
            bar.title = `${value} minutes`;
        });
        const total = Number(data.total_minutes) || 0;
        const totalLabel = document.getElementById("weeklyLearningTime");
        if (totalLabel) totalLabel.textContent = total ? (total >= 60 ? `${Math.floor(total / 60)}h ${total % 60}m` : `${total} min`) : "0 min";
        if (message) message.textContent = total ? "Your recorded learning sessions are shown above." : "No sessions logged this week yet. Add your first session below.";
    } catch (error) {
        console.error("Weekly activity:", error);
        if (message) message.textContent = error.message;
    }
}

const logLearningButton = document.getElementById("logLearningSession");
if (logLearningButton) {
    logLearningButton.addEventListener("click", async () => {
        const minutesInput = document.getElementById("learningMinutes");
        const skillInput = document.getElementById("learningSkill");
        const message = document.getElementById("weeklyActivityMessage");
        const minutes = Number(minutesInput.value);
        const token = localStorage.getItem("access_token");
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
            message.textContent = "Enter learning time between 1 and 600 minutes.";
            return;
        }
        logLearningButton.disabled = true;
        logLearningButton.textContent = "Saving...";
        try {
            const response = await fetch(`${API_URL}/learning-sessions`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    minutes,
                    skill_name: skillInput.value.trim() || "General learning",
                    activity_date: getLocalDateKey(new Date())
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "Could not save this session.");
            minutesInput.value = "";
            message.textContent = "Learning session saved.";
            await loadWeeklyActivity();
        } catch (error) {
            message.textContent = error.message;
        } finally {
            logLearningButton.disabled = false;
            logLearningButton.textContent = "＋ Log session";
        }
    });
}

// Load saved analysis and open Skill Analysis first
async function initializeDashboard() {

    // Load available job roles
    await loadJobRoles();
    await loadWeeklyActivity();

    // Fetch previously saved analysis
    const savedAnalysis = await loadSavedStudentAnalysis();
    console.log("Saved analysis:", savedAnalysis);
    console.log("Dashboard page:", document.getElementById("dashboardPage"));
    console.log("Analysis page:", document.getElementById("analysisPage"));

    if (savedAnalysis?.role_id) {
        await loadDashboardSummary(
            savedAnalysis.role_id,
            savedAnalysis.match_percentage
        );
    }

    if (savedAnalysis) {

        const categorySelect =
            document.getElementById("categorySelect");

        const careerSelect =
            document.getElementById("careerSelect");

        const skillsInput =
            document.getElementById("studentSkills");

        // Restore selected career
        const savedRole = allRoles.find(
            role =>
                String(role.role_id) === String(savedAnalysis.role_id)
        );

        if (savedRole) {

            categorySelect.value = savedRole.sector;

            updateCareerOptions(savedRole.sector);

            careerSelect.value = String(savedAnalysis.role_id);
        }

        // Restore previously entered skills
        if (skillsInput) {
            skillsInput.value =
                (savedAnalysis.student_skills || []).join(", ");
        }
    }

    // Always open Skill Analysis after login
    // Open saved analysis results when available
if (savedAnalysis) {
    displayAnalysisResults(savedAnalysis);
    showPage("dashboard");
} else {
    showPage("analysis");
}
}


initializeDashboard();


// =====================================
// MY PROFILE
// =====================================

const profileContent = document.getElementById("profileContent");

if (student) {

    profileContent.innerHTML = `

        <div class="panel">

            <h3>Personal Information</h3>

            <div style="padding:20px 0;">

                <p>
                    <strong>Full Name:</strong>
                    ${escapeHTML(student.name)}
                </p>

                <p style="margin-top:15px;">
                    <strong>Email:</strong>
                    ${escapeHTML(student.email)}
                </p>

                <p style="margin-top:15px;">
                    <strong>Student ID:</strong>
                    ${student.student_id}
                </p>

            </div>

        </div>

    `;

}

// =====================================
// SETTINGS
// =====================================

document.getElementById("settingsContent").innerHTML = `

    <div class="panel">

        <h3>Account Settings</h3>

        <p style="margin-top:15px; color:#858ba1;">
            Your account is currently active.
        </p>

        <button
            class="primary-button"
            id="settingsLogout"
            style="margin-top:20px;"
        >
            Log Out
        </button>

    </div>

`;

// =====================================
// LEARNING RESOURCES
// =====================================

async function loadLearningResources() {

    const resourcesContent =
        document.getElementById("resourcesContent");

    const missingSkills = JSON.parse(
        localStorage.getItem("missing_skills") || "[]"
    );

    if (missingSkills.length === 0) {

        resourcesContent.innerHTML = `
            <div class="panel">
                <h3>No skill gaps found yet</h3>
                <p>
                    Complete your Skill Analysis first.
                    Your recommended learning resources
                    will appear here.
                </p>
                <button class="primary-button"
                    onclick="showPage('analysis')">
                    Start Skill Analysis →
                </button>
            </div>
        `;

        return;
    }

    resourcesContent.innerHTML = `
        <p style="color:#858398; margin-bottom:20px;">
            Recommended learning resources based on
            your identified skill gaps.
        </p>
        <div id="skillResourceList"></div>
    `;

    const skillResourceList =
        document.getElementById("skillResourceList");

    const activeRoleId = localStorage.getItem("selected_role_id");
    const authToken = localStorage.getItem("access_token");
    let resourceStatuses = new Map();

    if (activeRoleId && authToken) {
        try {
            const progressResponse = await fetch(
                `${API_URL}/resource-progress/${activeRoleId}`,
                { headers: { "Authorization": `Bearer ${authToken}` } }
            );
            if (progressResponse.ok) {
                const progressData = await progressResponse.json();
                resourceStatuses = new Map(
                    (progressData.resources || []).map(item => [
                        Number(item.resource_id), item.status
                    ])
                );
            }
        } catch (error) {
            console.warn("Could not load resource progress:", error);
        }
    }

    for (const skill of missingSkills) {
        const displaySkill = skill.replace(/\b\w/g, char => char.toUpperCase());

        const skillSection = document.createElement("div");

        skillSection.className = "panel";

        skillSection.innerHTML = `
            <h2>${escapeHTML(displaySkill)}</h2>
            <p style="color:#858398; font-size:12px;">
            Resources to help you learn ${escapeHTML(displaySkill)}.
            </p>
            <div class="resource-loading">
                Loading resources...
            </div>
        `;

        skillResourceList.appendChild(skillSection);

        try {

            const response = await fetch(
                `${API_URL}/resources/${encodeURIComponent(skill)}`
            );

            if (!response.ok) {
                throw new Error("Unable to fetch resources.");
            }

            const data = await response.json();

            const loading =
                skillSection.querySelector(".resource-loading");

            if (!data.resources || data.resources.length === 0) {

                loading.textContent =
                    "No learning resources available for this skill.";

                continue;
            }

            loading.innerHTML = "";

            data.resources.forEach(resource => {

                const resourceCard = document.createElement("div");

                resourceCard.className = "resource-item";

                const resourceURL = String(resource.resource_url || "");

                const safeURL = /^https?:\/\//i.test(resourceURL)
                    ? resourceURL
                    : "";

                resourceCard.innerHTML = `
                    <div class="resource-details">

                        <span class="resource-type">
                            ${escapeHTML(resource.resource_type)}
                        </span>

                        <h3>
                            ${escapeHTML(resource.resource_title)}
                        </h3>

                        <p>
                            ${escapeHTML(resource.platform)}
                        </p>

                    </div>

                    ${
                        safeURL
                        ? `<a href="${escapeHTML(safeURL)}"
                             target="_blank"
                             rel="noopener noreferrer"
                             class="resource-link">
                             Start Learning →
                           </a>`
                        : `<span>Link unavailable</span>`
                    }
                    <label class="resource-progress-control">
                        Learning status
                        <select class="resource-status"
                            data-resource-id="${Number(resource.resource_id)}"
                            ${!authToken || !activeRoleId ? "disabled" : ""}>
                            <option value="Not Started" ${(resourceStatuses.get(Number(resource.resource_id)) || "Not Started") === "Not Started" ? "selected" : ""}>Not Started</option>
                            <option value="In Progress" ${resourceStatuses.get(Number(resource.resource_id)) === "In Progress" ? "selected" : ""}>In Progress</option>
                            <option value="Completed" ${resourceStatuses.get(Number(resource.resource_id)) === "Completed" ? "selected" : ""}>Completed</option>
                        </select>
                    </label>
                `;

                const statusSelect = resourceCard.querySelector(".resource-status");
                statusSelect.addEventListener("change", async function () {
                    const previousStatus = resourceStatuses.get(Number(resource.resource_id)) || "Not Started";
                    this.disabled = true;
                    try {
                        const updateResponse = await fetch(`${API_URL}/resource-progress/update`, {
                            method: "PUT",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${authToken}`
                            },
                            body: JSON.stringify({
                                role_id: Number(activeRoleId),
                                resource_id: Number(resource.resource_id),
                                status: this.value
                            })
                        });
                        const updateData = await updateResponse.json();
                        if (!updateResponse.ok) throw new Error(updateData.detail || "Could not update learning status.");
                        resourceStatuses.set(Number(resource.resource_id), this.value);
                    } catch (error) {
                        this.value = previousStatus;
                        alert(error.message);
                    } finally {
                        this.disabled = false;
                    }
                });

                loading.appendChild(resourceCard);

            });

        }

        catch (error) {

            skillSection.querySelector(".resource-loading")
                .textContent =
                "Could not load resources. Please try again.";
            console.error(error);
        }
    }
}

// =====================================
// RESUME UPLOAD AND ANALYSIS
// =====================================

const resumeButton = document.getElementById("analyzeResumeButton");

if (resumeButton) {
    resumeButton.addEventListener("click", async function () {
        const fileInput = document.getElementById("resumeFile");
        const message = document.getElementById("resumeMessage");
        const roleId = document.getElementById("careerSelect")?.value;
        const token = localStorage.getItem("access_token");
        const file = fileInput?.files?.[0];

        if (!token) {
            message.textContent = "Your session has expired. Please log in again.";
            return;
        }
        if (!roleId) {
            message.textContent = "Please select your target job role first.";
            return;
        }
        if (!file) {
            message.textContent = "Please choose a PDF resume to upload.";
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            message.textContent = "Please choose a PDF smaller than 8 MB.";
            return;
        }
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            message.textContent = "Only PDF resumes are supported.";
            return;
        }

        const formData = new FormData();
        formData.append("role_id", roleId);
        formData.append("resume", file);
        this.disabled = true;
        this.textContent = "Uploading and analysing...";
        message.textContent = "Extracting skills from your resume...";

        try {
            const response = await fetch(`${API_URL}/resume/analyze`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || "Resume analysis failed.");
            }

            localStorage.setItem("selected_role_id", String(roleId));
            const extracted = data.extracted_skills || [];
            const skillsField = document.getElementById("studentSkills");
            if (skillsField) skillsField.value = extracted.join(", ");
            displayAnalysisResults(data.analysis);
            message.textContent = `Resume analysed. ${data.total_extracted_skills || extracted.length} skills extracted.`;
        } catch (error) {
            message.textContent = error.message || "Could not analyse this resume.";
            console.error("Resume analysis error:", error);
        } finally {
            this.disabled = false;
            this.textContent = "Upload and Analyse Resume →";
        }
    });
}

// =====================================
// LOGOUT
// =====================================

function logoutStudent() {

    localStorage.removeItem("access_token");

    localStorage.removeItem("student");

    localStorage.removeItem("selected_role_id");

    window.location.href = "index.html";
}

document.getElementById("logoutButton").addEventListener(
    "click",
    logoutStudent
);

const settingsLogoutButton = document.getElementById("settingsLogout");
if (settingsLogoutButton) {
    settingsLogoutButton.addEventListener("click", logoutStudent);
}
