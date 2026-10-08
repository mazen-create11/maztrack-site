// Interactive Cockpit Demo Simulation
document.addEventListener('DOMContentLoaded', () => {
  const leadsData = {
    provencao: {
      name: "PROVENCAO SAS",
      meta: ["NAF 96.02A", "Dept 13 (Marseille)", "3 Hiring Signals Detected"],
      score: "94",
      analysis: '"Target company has registered a 24% revenue surge, renewed active job postings on France Travail for e-commerce managers, and migrated to a headless Shopify storefront. High probability need for automated CRM and localized B2B distribution."',
      subject: "Accélération e-commerce & distribution Provence pour Provencao",
      emailBody: `Bonjour Mouhanad,

J'ai remarqué le développement récent de votre gamme de muscs et savons à Marseille, ainsi que vos recrutements actifs en acquisition.

Avec l'expansion de votre catalogue (50+ références), plusieurs marques similaires réduisent de 40% leur friction logistique en automatisant la qualification de leurs revendeurs B2B régionaux.

Seriez-vous ouvert à échanger 10 minutes mardi prochain sur les résultats constatés sur ce type de déploiement ?`
    },
    aura: {
      name: "AURA STUDIO",
      meta: ["NAF 62.01Z", "Dept 13 (Aix-en-Provence)", "Tech Stack Migration"],
      score: "91",
      analysis: '"Creative agency scaling client deliveries. High frequency of bespoke design projects and 3D WebGL assets. Strong fit for automated client portal and automated proposal generation."',
      subject: "Automatisation des propositions & livrables chez Aura Studio",
      emailBody: `Hello l'équipe Aura,

J'ai vu votre récent drop interactif et vos réalisations WebGL soignées pour le streetwear.

Quand un studio de votre niveau enchaîne les lancements, 15h par semaine sont souvent perdues sur le suivi de projet et la relance des devis.

On a monté un pipeline léger qui synchronise briefs et livrables sans alourdir vos créatifs. On s'appelle 5 min cette semaine ?`
    },
    central: {
      name: "CENTRAL RESTO GROUP",
      meta: ["NAF 56.10A", "Dept 83 (Toulon)", "Multi-Unit Expansion"],
      score: "78",
      analysis: '"Multi-location retail & dining chain opening 2 new outlets. High recruitment velocity for floor staff and inventory managers. High propensity for centralized procurement outreach."',
      subject: "Optimisation du sourcing fournisseurs pour vos nouvelles adresses",
      emailBody: `Bonjour,

Félicitations pour l'ouverture prochaine de vos nouvelles implantations sur Toulon et environs.

Pour les groupes multi-sites en phase d'extension, centraliser le sourcing local évite les surcoûts d'urgence de 12 à 18%.

Avez-vous déjà verrouillé vos partenariats d'approvisionnement pour ce trimestre ?`
    },
    solira: {
      name: "SOLIRA INNOVATION",
      meta: ["NAF 71.12B", "Dept 06 (Nice)", "Seed Round Closed"],
      score: "74",
      analysis: '"CleanTech engineering consultancy with new public patents filed in solar optimization. Seeking industrial subcontractors across PACA."',
      subject: "Partenariats industriels & fabrication PACA pour Solira",
      emailBody: `Bonjour l'équipe Solira,

Impressionnant parcours sur le dépôt de vos brevets solaires ce mois-ci.

Nous aidons les bureaux d'études de la région à cartographier et engager les partenaires industriels pertinents sans passer des semaines en prospection manuelle.

Seriez-vous disponibles pour un court point de cadrage ?`
    }
  };

  const leadItems = document.querySelectorAll('.lead-item');
  const leadNameEl = document.querySelector('.lead-name');
  const metaRowEl = document.querySelector('.meta-row');
  const analysisTextEl = document.querySelector('.analysis-text');
  const emailContentEl = document.querySelector('.email-content');

  const leadKeys = ['provencao', 'aura', 'central', 'solira'];

  leadItems.forEach((item, index) => {
    item.addEventListener('click', () => {
      leadItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const data = leadsData[leadKeys[index]];
      if (!data) return;

      leadNameEl.textContent = data.name;
      
      // Update metadata badges
      metaRowEl.innerHTML = data.meta.map(m => {
        const isGreen = m.includes('Signal') || m.includes('Migration') || m.includes('Expansion');
        return `<span class="badge ${isGreen ? 'badge-green' : ''}">${m}</span>`;
      }).join('');

      analysisTextEl.textContent = data.analysis;

      emailContentEl.innerHTML = `
        <p><strong>Subject:</strong> ${data.subject}</p>
        ${data.emailBody.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}
      `;
    });
  });
});
