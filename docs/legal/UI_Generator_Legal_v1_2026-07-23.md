# UI Generator Terms and Privacy v1

**Prepared for PatternBreak**  
**Version:** 2026-07-23  
**Prepared:** July 23, 2026

This bundle contains:

1. Implementation copy for sign-up, checkout, renewal, cancellation, and footer links
2. Terms of Use
3. Privacy Policy

---

# UI Generator legal implementation copy

**Version:** 2026-07-23  
**Prepared:** July 23, 2026  
**Operator used in this draft:** PatternBreak  
**Privacy and legal contact used in this draft:** chevon@patternbreak.com

> **Internal launch note:** This is a practical v1 drafted for the current UI Generator product and registration flow. Before publishing, confirm PatternBreak's exact legal entity name or suffix, confirm that chevon@patternbreak.com is the desired public contact, and verify the live hosting, authentication, storage, analytics, email, and error-monitoring vendors named or described in the Privacy Policy. A qualified attorney should review the documents before major scale, a marketplace launch, team/classroom accounts, or material changes to data practices.

## 1. Account sign-up

### Required consent checkbox

**Checkbox label:**

> I agree to the [Terms of Use](/terms) and acknowledge the [Privacy Policy](/privacy).

The checkbox should be unchecked by default and required before account creation.

**Eligibility note, displayed near sign-up but outside the checkbox:**

> Accounts are for users age 13 and older. If you have not reached the age of majority where you live, a parent or legal guardian must agree to the Terms on your behalf.

**Age-screening implementation note:** The eligibility statement is contractual, not a verified age screen. If UI Generator asks for age or date of birth, collect it neutrally before other registration data and prevent an under-13 user's account creation or personal-information submission unless a COPPA-compliant parental-consent flow is implemented. Do not use a simple “I am 13+” checkbox as the only age-screening mechanism.

### Privacy notice at collection

Place this immediately below the email/account fields or directly below the required checkbox:

> PatternBreak collects your email, account identifiers, device and security data, and any projects you choose to save in order to create and secure your account, provide cloud saves and plan entitlements, support you, and improve UI Generator. Local-only projects remain in your browser unless you choose to save or publish them. We do not sell personal information or share it for cross-context behavioral advertising. Learn more in the [Privacy Policy](/privacy).

### Optional marketing checkbox

Keep this separate, optional, and unchecked by default:

> Send me occasional product updates, new kit releases, tutorials, and offers.

Do not make marketing consent a condition of creating an account or buying a subscription.

## 2. Paid checkout and automatic renewal

The renewal disclosure must be visually close to the purchase button and separate from general Terms acceptance.

### Founding Individual checkout copy

**Plan label:** Founding Individual  
**Price line:** $29.99 per year, plus applicable tax

**Renewal disclosure:**

> You will be charged $29.99 today, plus applicable tax. This subscription renews automatically every 12 months at the then-current annual price unless you cancel. Cancel anytime online in Account > Billing; cancellation stops the next charge, and paid access continues through the end of the current term. We will email you a renewal reminder before the annual renewal date.

**Required renewal authorization checkbox:**

> I authorize PatternBreak to charge $29.99 today and automatically each year unless I cancel, and I agree to the subscription terms above.

**Purchase button:**

> Start annual membership - $29.99

### Student checkout copy

**Plan label:** Student  
**Price line:** $15.99 per year, plus applicable tax

**Renewal disclosure:**

> You will be charged $15.99 today, plus applicable tax. This subscription renews automatically every 12 months at the then-current annual price unless you cancel. Cancel anytime online in Account > Billing; cancellation stops the next charge, and paid access continues through the end of the current term. We will email you a renewal reminder before the annual renewal date. Student eligibility may be reverified before renewal.

**Required renewal authorization checkbox:**

> I authorize PatternBreak to charge $15.99 today and automatically each year unless I cancel, and I agree to the subscription terms above.

**Purchase button:**

> Start student membership - $15.99

### Pricing note

If Founding Individual pricing is intended to remain permanently locked for that customer, replace "at the then-current annual price" with:

> at your locked founding rate of $29.99 per year

Do not use the locked-rate version unless PatternBreak intends to honor that promise for the life of the subscription.

## 3. Purchase confirmation email

**Subject:** Your UI Generator annual membership is active

**Body:**

> Thanks for joining UI Generator. Your **[Plan Name]** membership is now active.  
>  
> Amount charged: **[Amount] plus applicable tax**  
> Billing period: **Annual**  
> Next renewal date: **[Date]**  
>  
> Your membership will renew automatically on the date above at the then-current annual price unless you cancel. You can manage or cancel your subscription at any time in **Account > Billing**: [Manage Subscription]. Cancellation stops the next renewal charge and does not end access early.  
>  
> [Terms of Use] | [Privacy Policy] | [Contact Support]

The confirmation must be capable of being retained by the customer.

### Fee-change notice, when applicable

Send this no fewer than 7 days and no more than 30 days before a changed subscription fee takes effect:

**Subject:** Your UI Generator membership price is changing

**Body:**

> Beginning with your renewal on **[Date]**, the annual price of your **[Plan Name]** membership will change from **[Old Amount]** to **[New Amount] plus applicable tax**. Unless you cancel before the renewal date, your saved payment method will be charged the new amount automatically.  
>  
> Manage or cancel online: [Manage Subscription]  
>  
> [Terms of Use] | [Privacy Policy] | [Contact Support]

## 4. Annual renewal reminder

Send this between 15 and 45 days before an annual renewal.

**Subject:** Your UI Generator membership renews on [Date]

**Body:**

> Your **[Plan Name]** membership is scheduled to renew on **[Date]** for **[Amount] plus applicable tax**. Unless you cancel before that date, your saved payment method will be charged automatically.  
>  
> Manage or cancel online: [Manage Subscription]  
>  
> Cancellation stops the upcoming charge and leaves your paid access active through the end of the current term.  
>  
> [Terms of Use] | [Privacy Policy] | [Contact Support]

## 5. Cancellation interface

Place a prominent button in **Account > Billing**:

> Cancel automatic renewal

Confirmation dialog:

> **Cancel automatic renewal?**  
> You will not be charged again. Your paid features will remain available through **[Paid Through Date]**, after which your account will move to the Free plan. Your locally stored projects will remain in your browser. Cloud projects will be handled according to the Terms of Use and Privacy Policy.

Primary action:

> Confirm cancellation

Secondary action:

> Keep membership

Confirmation state:

> Automatic renewal is canceled. Your paid access remains active through **[Paid Through Date]**.

Do not require a phone call, support chat, survey completion, or retention offer before cancellation can be completed.

## 6. Footer links

Use these on every public page and inside the signed-in application:

- Terms of Use -> `/terms`
- Privacy Policy -> `/privacy`
- Contact -> the current support/contact route or `mailto:chevon@patternbreak.com`
- Cookie Settings -> only if nonessential cookies or analytics controls are implemented

A "Do Not Sell or Share My Personal Information" footer link is not necessary while PatternBreak does not sell personal information or share it for cross-context behavioral advertising. Add the link and supporting workflow before any such practice begins.

## 7. Consent and version records

Store at minimum:

- User/account identifier
- Terms version: `2026-07-23`
- Privacy version: `2026-07-23`
- Terms/privacy acceptance timestamp
- Sign-up source or interface version
- Subscription-offer version
- Renewal-consent timestamp
- Plan, price, currency, and billing interval shown at consent
- Payment processor customer/subscription identifiers
- Cancellation timestamp and effective paid-through date

Maintain automatic-renewal consent records for at least three years, or one year after the subscription ends, whichever is longer. Keep each published Terms and Privacy version available internally so the accepted text can be reconstructed.

## 8. Launch verification

Before turning registration on, verify that:

1. `/terms` and `/privacy` resolve publicly without authentication.
2. The sign-up checkbox is unchecked and required.
3. Terms and Privacy version acceptance is written to the account record.
4. The annual-renewal disclosure appears before payment confirmation.
5. Renewal authorization is affirmative and separately recorded.
6. The confirmation email contains the price, renewal term, cancellation policy, and direct cancellation path.
7. Annual reminders are scheduled 15-45 days before renewal.
8. Online cancellation works without contacting support.
9. Account deletion and privacy-request workflows have a real destination.
10. Local-only, cloud-saved, and public projects behave exactly as the policies describe.
11. If age or date of birth is collected, the age screen is neutral and under-13 data collection is blocked unless a compliant parental-consent flow exists.
12. A registered user under 18 can remove their own public content or send a working **Minor Content Removal** request.
13. If subscription pricing changes, a fee-change notice is scheduled 7-30 days before the new fee takes effect.


---

# Terms of Use

**Effective date:** July 23, 2026  
**Last updated:** July 23, 2026

These Terms of Use (the **"Terms"**) are a binding agreement between you and PatternBreak, the operator of UI Generator (**"PatternBreak," "we," "us,"** or **"our"**). They govern your access to and use of the UI Generator website, browser application, accounts, subscriptions, templates, kits, project tools, sharing features, exports, and related services (collectively, the **"Service"**).

By accessing or using the Service, creating an account, or purchasing a subscription, you agree to these Terms. If you use the Service on behalf of a company, school, studio, or other organization, you represent that you have authority to bind that organization, and **"you"** includes that organization.

## Plain-language overview

- You keep ownership of the original files, text, artwork, and other content you upload.
- PatternBreak owns UI Generator, its software, kits, templates, component systems, and other underlying materials.
- Exported designs that your plan lawfully makes available may be used in personal and commercial end products, but you may not resell or redistribute them as standalone stock packs, templates, source libraries, or a competing UI generator.
- Paid plans renew automatically for the disclosed billing period unless you cancel before renewal.
- Projects are private unless you choose to publish or share them.

This overview is provided for convenience. The complete Terms below control.

## 1. The Service

UI Generator is a browser-based, deterministic design and production tool for building game and interactive-interface components, assemblies, screens, and exportable assets. Depending on the plan and current feature set, the Service may include local editing, cloud saves, public share links, templates and kits, previews, and exports such as PNG, SVG, sprites, nine-slice assets, full-kit packages, and engine-oriented formats for tools such as Unity or Unreal.

Features, limits, kits, export formats, storage allowances, and availability may vary by plan and may change over time. We may identify some features as beta, preview, experimental, or part of a separate lab environment. Those features may be changed or removed at any time.

UI Generator is a deterministic design tool and does not promise that a configuration or output will be unique. Other users may independently create similar or identical results.

## 2. Eligibility

You must be at least 13 years old to create an account or use account-based features. If you have not reached the age of majority where you live, you may use the Service only with permission from a parent or legal guardian who agrees to these Terms on your behalf.

The Service is not directed to children under 13. Do not create an account or submit personal information if you are under 13.

You may not use the Service if applicable law prohibits you from receiving the Service, including applicable trade sanctions or export-control restrictions.

## 3. Accounts and account security

You agree to provide accurate account information and keep it current. You are responsible for maintaining the confidentiality of your login credentials and for activity under your account. Notify us promptly at chevon@patternbreak.com if you believe your account has been accessed without authorization.

You may not sell, transfer, rent, or share an account in a way that defeats plan limits or allows unrelated users to use an individual account. We may impose reasonable limits on sessions, devices, storage, exports, and automated activity to protect the Service and enforce plan terms.

## 4. Local projects, cloud saves, and backups

Some projects or settings may be stored locally in your browser or device. Local-only data is not a cloud backup. PatternBreak cannot recover local-only projects that are lost because you clear browser data, change devices, use private-browsing mode, remove local files, or experience device or browser failure. You are responsible for maintaining copies of important exported work.

Projects are uploaded to our systems only when the feature requires it or when you choose an account-based action such as cloud save, synchronization, publishing, or sharing. We do not promise that cloud storage is permanent or suitable as your sole archival system.

## 5. Plans, subscriptions, and billing

### 5.1 Free and paid plans

The Service may offer a Free plan and one or more paid plans. Plan features, prices, taxes, usage limits, export rights, and billing periods are shown on the pricing page or at checkout and are incorporated into these Terms.

### 5.2 Automatic renewal

Unless checkout expressly states otherwise, a paid subscription renews automatically for the same billing period until canceled. By purchasing, you authorize PatternBreak and its payment processor to charge your selected payment method for the price shown at checkout, applicable taxes, and each renewal at the then-current renewal price.

Before purchase, we will disclose the renewal period, price or pricing basis, and cancellation method. We will provide acknowledgments and renewal notices required by applicable law. A price change will apply no earlier than your next renewal and will be communicated in advance when required.

### 5.3 Cancellation

You may cancel automatic renewal online through **Account > Billing** or another online cancellation method we provide. Cancellation stops the next renewal charge. Unless required by law or stated otherwise, cancellation does not end paid access immediately; paid features remain available through the end of the current paid term, after which the account moves to the applicable Free plan.

Deleting the application, abandoning an account, or removing a payment method does not by itself cancel a subscription.

### 5.4 Refunds

Payments are nonrefundable and we do not provide prorated refunds or credits for partially used billing periods, except where required by law or expressly stated at checkout. This does not limit any nonwaivable consumer rights.

### 5.5 Failed payments and taxes

If a payment fails, we or our payment processor may retry the charge, ask you to update payment information, restrict paid features, or downgrade or suspend the account. You are responsible for applicable taxes other than taxes imposed on PatternBreak's income.

### 5.6 Student plans

Student pricing may require a qualifying education email address, a current student or faculty ID, an instructor code, or another reasonable eligibility check. You agree to provide truthful eligibility information. We may reverify eligibility before renewal. If you are no longer eligible, we may end the student price or offer conversion to another plan after advance notice. A student plan is personal and non-transferable.

Student plans include the same features and export formats as Pro. They are licensed for education use: coursework, academic work, your portfolio, personal projects, and non-commercial release. Selling a product built with assets exported under a student plan, or distributing them in anything that generates revenue, requires a Pro licence. You may upgrade at any time and re-export under the Pro licence, which then governs those files.

## 6. Limited license to use the Service

Subject to these Terms, PatternBreak grants you a limited, nonexclusive, nontransferable, revocable license to access and use the Service for your own personal, educational, or professional design work during the applicable plan term.

Except as allowed by law or expressly permitted in writing, you may not:

- copy, modify, distribute, sell, lease, sublicense, or create a substitute for the Service or its underlying software;
- reverse engineer, decompile, disassemble, or attempt to discover source code or nonpublic design-system logic;
- bypass authentication, paywalls, plan limits, export controls, credits, watermarks, security measures, or technical restrictions;
- scrape, crawl, harvest, or use abusive automation against the Service;
- use the Service or PatternBreak Materials to build, train, benchmark, or operate a substantially competing generator, template system, asset library, or model;
- remove proprietary notices; or
- permit another person to do any of the above.

## 7. PatternBreak Materials

The Service and all materials supplied by PatternBreak, including software, interface design, kits, templates, recipes, component structures, presets, sample content, icons, documentation, trademarks, branding, and source assets (collectively, **"PatternBreak Materials"**), are owned by PatternBreak or its licensors and are protected by intellectual-property laws.

Except for the limited licenses expressly granted in these Terms, no rights in PatternBreak Materials are transferred to you.

## 8. Your Content

**"Your Content"** means text, project names, files, artwork, fonts, images, logos, data, and other material that you upload, import, enter, or submit to the Service, excluding PatternBreak Materials.

As between you and PatternBreak, you retain ownership of Your Content. You grant PatternBreak a nonexclusive, worldwide, royalty-free license to host, store, reproduce, process, transmit, and display Your Content only as reasonably necessary to provide, secure, support, and improve the Service, comply with law, and carry out your sharing or publishing choices.

You represent that you have all rights and permissions needed to use Your Content and to grant this license. You may not upload or publish content that infringes intellectual-property, privacy, publicity, confidentiality, or other rights.

Do not place confidential information, trade secrets, regulated data, or personal information you do not have authority to share in a public project or public share link.

We do not use private project content to train generative AI models.

## 9. Exported Designs and commercial use

**"Exported Designs"** means design outputs that the Service lawfully permits you to download or export under your plan. Exported Designs may combine your selections and Your Content with PatternBreak Materials.

Subject to these Terms and any plan-specific license or third-party license shown at export, PatternBreak grants you a nonexclusive, worldwide, perpetual license to use, reproduce, modify, display, perform, and distribute Exported Designs in personal or commercial end products, including games, applications, websites, prototypes, videos, presentations, marketing materials, and client work.

You may provide Exported Designs to employees, clients, publishers, developers, and contractors solely as needed to create, ship, operate, or maintain an end product for you or your client, provided they do not reuse or redistribute the assets separately.

You may not, whether free or paid:

- sell, sublicense, distribute, or make Exported Designs available primarily as standalone stock assets, UI packs, templates, source libraries, component kits, themes, or downloadable design resources;
- use exports to create a product that substitutes for UI Generator or materially competes with PatternBreak's kits or generator;
- extract or redistribute PatternBreak Materials separately from an end product;
- claim exclusive ownership of an underlying PatternBreak template, kit, component system, or configuration that may also be available to others; or
- misrepresent the source, exclusivity, or authorship of third-party materials.

Your license applies only to exports made available to you lawfully under your plan. Access to additional formats or batch/full-kit exports may require an active paid plan at the time of export. Ending a subscription does not revoke the license for Exported Designs lawfully created and downloaded during the paid term, but it does end access to paid Service features and future paid exports.

Some exports may include open-source fonts, icons, libraries, or other third-party materials. Those materials remain subject to their own licenses, which may require notices, attribution, or other conditions. You are responsible for reviewing and complying with applicable third-party licenses.

PatternBreak does not guarantee that any Exported Design is copyrightable, registrable, exclusive, noninfringing in every jurisdiction, or suitable for a particular platform or marketplace. You are responsible for final review, testing, clearance, and implementation.

## 10. Public projects and sharing

Projects are not made public by default. If you publish a project, create a public profile, submit work to a showcase, or generate a public share link, you direct us to make that content available according to the selected setting.

Public content may be viewed, copied, linked to, cached, captured, or indexed by others. Do not publish material you wish to keep confidential. Removing a public page will stop future display through the Service, but copies, search caches, and third-party captures may remain outside our control.

For content you choose to make public, you grant PatternBreak a nonexclusive, worldwide, royalty-free license to host, display, reproduce, format, and distribute that public content as needed to operate and promote the Service, including featuring it in a UI Generator showcase with the name or attribution you provide. You may end this promotional license for future use by unpublishing the content or contacting us, subject to reasonable time for removal and previously produced materials.

We may remove, limit, or refuse public content that violates these Terms, creates legal or security risk, or is inappropriate for the Service.

## 11. Acceptable use

You may not use the Service to:

- violate law or another person's rights;
- upload malware, malicious code, credential-stealing material, or content designed to disrupt a system;
- harass, threaten, exploit, impersonate, defraud, or mislead another person;
- publish unlawful, infringing, hateful, sexually exploitative, or otherwise abusive content;
- probe or compromise security without prior written authorization;
- interfere with other users or place unreasonable load on the Service;
- automate account creation, exports, or access in a manner not expressly supported;
- resell access, share credentials commercially, or evade usage limits; or
- use the Service in connection with a product or activity prohibited by applicable law.

## 12. Feedback

If you provide suggestions, ideas, feature requests, or other feedback, you grant PatternBreak a perpetual, irrevocable, worldwide, royalty-free right to use and incorporate that feedback without restriction or compensation. This does not transfer ownership of Your Content or private projects.

## 13. Intellectual-property complaints

If you believe content on the Service infringes your intellectual-property rights, email chevon@patternbreak.com with the subject line **"IP Complaint"** and include:

- identification of the protected work;
- identification and location of the allegedly infringing content;
- your contact information;
- a statement explaining your good-faith belief that the use is unauthorized; and
- a statement that the information in the notice is accurate and that you are authorized to act for the rights holder.

We may remove content and restrict accounts when appropriate. Knowingly submitting a false complaint may create liability.

## 14. Third-party services

The Service may rely on or link to third-party services, including payment processing, hosting, authentication, storage, email, analytics, error monitoring, and game-engine or export tools. Third-party services are governed by their own terms and privacy policies. PatternBreak is not responsible for third-party services or for changes they make.

Payments are processed by Stripe. PatternBreak does not store full payment-card numbers or card security codes on its own systems.

## 15. Service changes and availability

We may update, modify, suspend, or discontinue any part of the Service. We will try to provide reasonable notice when a change materially reduces a paid plan during its current term, but emergency, security, legal, and beta-feature changes may occur without advance notice.

The Service may experience interruptions, data loss, latency, bugs, or incompatibility. You are responsible for maintaining backups and testing exports before production use.

## 16. Suspension and termination

You may stop using the Service at any time and may request account deletion. Subscription cancellation and account deletion are separate actions.

We may suspend or terminate access if you materially breach these Terms, fail to pay, create security or legal risk, abuse the Service, or if required by law. When reasonably possible, we will provide notice and an opportunity to cure before terminating a paid account, unless immediate action is necessary.

Upon termination, your right to access the Service ends. Sections that by their nature should survive will survive, including ownership, export-license restrictions, payment obligations, disclaimers, limitations of liability, indemnity, and dispute provisions. Licenses for Exported Designs lawfully downloaded before termination survive unless the export or Your Content infringed rights or was obtained through fraud or circumvention.

## 17. Disclaimers

To the maximum extent permitted by law, the Service, PatternBreak Materials, and Exported Designs are provided **"as is"** and **"as available."** PatternBreak disclaims all express and implied warranties, including merchantability, fitness for a particular purpose, title, noninfringement, accuracy, availability, and compatibility.

We do not warrant that the Service will be uninterrupted, secure, error-free, or free from harmful components; that projects will never be lost; that exports will work without modification in Unity, Unreal, another engine, browser, platform, or production pipeline; or that outputs will satisfy legal, accessibility, marketplace, performance, or brand requirements.

Nothing in these Terms excludes warranties or rights that cannot lawfully be excluded.

## 18. Limitation of liability

To the maximum extent permitted by law, PatternBreak and its owners, employees, contractors, affiliates, and licensors will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenue, goodwill, data, projects, business opportunity, or production time, arising from or related to the Service, even if advised that such damages are possible.

To the maximum extent permitted by law, PatternBreak's total aggregate liability arising from or related to the Service or these Terms will not exceed the greater of: (a) the amount you paid PatternBreak for the Service during the 12 months before the event giving rise to the claim; or (b) US $100.

These limitations do not apply to liability that cannot be limited by law, or to PatternBreak's fraud, willful misconduct, or gross negligence where exclusion is prohibited.

## 19. Indemnity

To the extent permitted by law, you agree to defend, indemnify, and hold harmless PatternBreak and its owners, employees, contractors, affiliates, and licensors from claims, damages, losses, liabilities, and reasonable legal fees arising from: Your Content; your public projects; your end products; your violation of these Terms or law; or your infringement of another person's rights.

This section does not require an individual consumer to indemnify PatternBreak to the extent prohibited by applicable consumer law.

## 20. Governing law and disputes

California law governs these Terms, without regard to conflict-of-law rules. Before filing a formal claim, you and PatternBreak agree to make a good-faith effort to resolve the dispute informally for at least 30 days after written notice is received.

Unless applicable law gives you the right to bring a claim elsewhere, any dispute not resolved informally must be brought in the state or federal courts located in Los Angeles County, California, and each party consents to those courts' jurisdiction.

Nothing in these Terms prevents either party from seeking injunctive or equitable relief for misuse of intellectual property, unauthorized access, or security threats. Nothing limits nonwaivable rights available to consumers in their place of residence.

## 21. Changes to these Terms

We may update these Terms. We will post the revised Terms with a new effective date and, when a change is material, provide additional notice through the Service, account email, or another reasonable method. Changes generally apply prospectively. Continued use after the effective date constitutes acceptance where permitted by law; if the law requires affirmative consent, we will request it.

## 22. General terms

These Terms and any plan-specific or checkout terms are the entire agreement between you and PatternBreak regarding the Service. If they conflict, the more specific plan or checkout term controls for that subject.

If any provision is unenforceable, it will be modified to the minimum extent necessary and the remaining provisions will continue. Our failure to enforce a provision is not a waiver. You may not assign these Terms without our written consent. PatternBreak may assign them in connection with a merger, reorganization, financing, sale of assets, or transfer of the Service, subject to applicable law.

Headings are for convenience only. The word **"including"** means **"including without limitation."**

## 23. Contact

Questions about these Terms may be sent to:

**PatternBreak**  
Los Angeles, California, United States  
Email: chevon@patternbreak.com


---

# Privacy Policy

**Effective date:** July 23, 2026  
**Last updated:** July 23, 2026

PatternBreak (**"PatternBreak," "we," "us,"** or **"our"**) operates UI Generator. This Privacy Policy explains how we collect, use, disclose, and protect personal information when you visit or use the UI Generator website, browser application, account, subscription, sharing features, and related services (collectively, the **"Service"**).

## Privacy at a glance

- UI Generator is designed to be local-first. Projects stored only in your browser are not uploaded to PatternBreak unless you choose a cloud, synchronization, publishing, or sharing feature that requires upload.
- Stripe handles payment-card entry. PatternBreak does not store full card numbers or card security codes on its own systems.
- Projects are private unless you choose to publish or share them.
- We do not sell personal information or share it for cross-context behavioral advertising.
- We do not use private project content to train generative AI models.
- The Service is not intended for children under 13.

## 1. Scope

This Policy applies to personal information processed by PatternBreak through the Service. It does not govern third-party websites, applications, engines, plug-ins, or services that have their own privacy policies.

## 2. Information we collect

### 2.1 Account and profile information

When you create or manage an account, we may collect:

- email address;
- display name, username, profile image, or other optional profile details;
- account identifiers and authentication records;
- plan, entitlement, and account-status information;
- age-eligibility confirmation; and
- student-eligibility information, such as an education email domain or instructor code.

Authentication credentials are handled through our authentication systems or providers. We do not need or intend to view your plaintext password.

### 2.2 Project and user-content information

Depending on how you use the Service, we may process:

- project files, component settings, palettes, typography selections, presets, and project names;
- artwork, logos, images, fonts, text, or other material you import or upload;
- cloud saves, version information, export metadata, and share settings;
- public profile information and projects you choose to publish; and
- support files or examples you send to us for troubleshooting.

Local-only projects remain in your browser or device unless you choose an action that uploads them or unless a particular feature clearly requires server processing.

### 2.3 Subscription and transaction information

When you purchase or manage a subscription, we may receive:

- plan name, price, currency, billing interval, tax, and renewal date;
- transaction status, invoice or receipt details, refunds, disputes, and failed-payment information;
- payment-processor customer and subscription identifiers; and
- limited payment-method details such as card brand and last four digits, when provided by the processor.

Payment-card information is entered directly into Stripe. The processor may collect and use information for payment processing, fraud prevention, security, legal compliance, and its own disclosed purposes.

### 2.4 Device, usage, and log information

When you use the Service, we and our service providers may automatically collect:

- IP address and general location inferred from IP;
- browser type, operating system, device type, language, and time zone;
- referring and exit pages, timestamps, pages or features used, interactions, and session information;
- authentication, security, rate-limit, export, download, and error logs;
- cookie, local-storage, and similar-technology identifiers; and
- diagnostic information about crashes, performance, and compatibility.

We aim to limit analytics to information reasonably needed to operate, secure, understand, and improve the Service.

### 2.5 Communications

We collect information you provide when you contact us, request support, submit feedback, participate in a survey, report a problem, or communicate about billing or privacy.

### 2.6 Information from third parties

We may receive information from:

- Stripe;
- authentication providers you choose to use;
- hosting, database, storage, email, analytics, security, and error-monitoring providers;
- education organizations or instructors when an eligibility code is used; and
- public sources or rights holders in connection with an intellectual-property or abuse report.

## 3. Local storage, cloud saves, and public sharing

UI Generator may store settings and projects in browser storage so that core work can occur locally. PatternBreak cannot access or recover content that remains solely on your device. Clearing browser storage, using private-browsing mode, changing devices, or losing a device may delete local projects.

When you use cloud save, synchronization, protected export, account entitlement, or another server-based feature, the information needed for that feature is transmitted to and stored by PatternBreak and its service providers.

Projects are not public by default. If you publish a project, create a public profile, submit to a showcase, or create a public share link, the information covered by that setting may be visible to anyone who can access it and may be copied, cached, or indexed outside our control.

## 4. How we use information

We may use personal information to:

- create, authenticate, secure, and administer accounts;
- provide local-to-account features, cloud saves, entitlements, exports, downloads, and sharing choices;
- process subscriptions, payments, renewals, cancellations, taxes, refunds, and billing support;
- communicate about the Service, security, transactions, policy changes, and support requests;
- provide optional product news or marketing when permitted, with an unsubscribe option;
- detect, investigate, and prevent fraud, abuse, malware, account compromise, and violations of our Terms;
- troubleshoot errors, monitor reliability, and improve features, usability, accessibility, and performance;
- understand aggregate usage and plan demand;
- enforce agreements and protect users, PatternBreak, and others;
- comply with legal, tax, accounting, and regulatory obligations; and
- establish, exercise, or defend legal claims.

We do not use private project content to train generative AI models.

## 5. Legal bases for processing outside the United States

Where a law requires a legal basis, we generally process personal information under one or more of the following:

- **Contract:** to create an account, provide requested features, process a subscription, and fulfill the Terms of Use.
- **Legitimate interests:** to secure and improve the Service, prevent abuse, support users, understand product performance, and protect legal rights, when those interests are not overridden by your rights.
- **Consent:** for optional marketing, nonessential cookies, or another purpose for which we ask consent. You may withdraw consent prospectively.
- **Legal obligation:** to comply with tax, accounting, consumer-protection, sanctions, court-order, and other legal requirements.

## 6. How we disclose information

We may disclose personal information in the following circumstances:

### 6.1 Service providers

We use companies that provide services such as hosting, content delivery, authentication, database and object storage, payment processing, transactional email, customer support, analytics, security, and error monitoring. They may process information only as needed to provide their services to us, subject to contractual and legal obligations.

Stripe processes subscription payments. Our hosting, authentication, database, storage, email, analytics, security, and error-monitoring providers process only the account, project, transaction, device, and log information reasonably needed for their services. We review provider access and update this Policy when a provider materially changes our privacy practices.

### 6.2 At your direction or publicly

We disclose information when you direct us to, such as when you create a public share link, publish a project or profile, submit work to a showcase, connect a third-party service, or ask us to send information to a collaborator.

### 6.3 Legal, safety, and enforcement reasons

We may disclose information if we reasonably believe it is necessary to comply with law or legal process; protect rights, safety, property, or users; investigate fraud, abuse, or security incidents; enforce agreements; or respond to a valid rights complaint.

### 6.4 Professional advisers

We may disclose information to lawyers, accountants, auditors, insurers, and other professional advisers who are bound by confidentiality duties.

### 6.5 Business transactions

Information may be disclosed or transferred in connection with a financing, merger, acquisition, reorganization, bankruptcy, sale of assets, or transfer of all or part of the Service. We will provide notice when required and require the recipient to handle personal information consistently with applicable law.

## 7. No sale or cross-context behavioral advertising

PatternBreak does not sell personal information for money or other valuable consideration and does not share personal information for cross-context behavioral advertising, as those terms are defined by California law. We do not allow third-party advertising networks to use the Service to build advertising profiles across unrelated websites or applications.

If our practices materially change, we will update this Policy and provide any notice, consent, and opt-out mechanisms required before the new practice begins.

## 8. Cookies, local storage, and tracking choices

The Service may use:

- **Essential technologies** for authentication, security, fraud prevention, load balancing, subscription state, and requested functionality;
- **Preference technologies** to remember display, editor, or accessibility settings; and
- **Limited analytics or diagnostic technologies** to understand use, errors, and performance.

Stripe and other service providers may set cookies or collect device and transaction information for payment, authentication, security, and fraud prevention under their own privacy notices.

You can control many cookies through browser settings, but blocking essential technologies may prevent account, billing, save, or export features from working. Clearing local storage may delete local-only projects and settings.

UI Generator does not currently engage in cross-site behavioral tracking for advertising. We do not respond to legacy browser **"Do Not Track"** signals, which are not standardized. Where applicable law requires recognition of an opt-out preference signal such as Global Privacy Control, we treat it as a request to opt out of sale or cross-context behavioral sharing. Because we currently do neither, the signal does not change our current practices.

## 9. Data retention

We retain personal information only for as long as reasonably necessary for the purposes described in this Policy, including to provide the Service, maintain security, meet legal and accounting obligations, resolve disputes, and enforce agreements.

Retention periods vary by data type:

- account and cloud-project information is generally retained while the account is active and for a reasonable period after deletion to complete the request, prevent fraud, and maintain backups;
- subscription and transaction records may be retained as required for tax, accounting, dispute, and legal purposes;
- security, diagnostic, and access logs are retained for a limited period appropriate to their purpose;
- public content is removed from active display after unpublishing or deletion, but search caches and third-party copies may persist; and
- local-only projects remain on your device until you delete them, clear storage, or the browser removes them.

Backups are overwritten or deleted on a rolling schedule. We may retain deidentified or aggregated information that cannot reasonably identify you.

## 10. Security

We use administrative, technical, and organizational measures designed to protect personal information, including access controls, encrypted transmission where appropriate, reputable infrastructure providers, and monitoring for abuse. No online system or storage method is completely secure, and we cannot guarantee absolute security.

You are responsible for protecting your credentials, devices, browser profile, exported files, and public-share settings. Contact us promptly if you suspect unauthorized account access.

## 11. Your choices and rights

### 11.1 Account and project controls

Depending on available features, you may be able to review or update account information, delete cloud projects, unpublish public content, cancel a subscription, export certain project data, or request account deletion from account settings.

Deleting an account does not automatically erase local-only projects from your browser. Clearing browser storage or deleting local files is your responsibility.

### 11.2 Marketing communications

You may unsubscribe from marketing email through the unsubscribe link or by contacting us. We may still send nonmarketing communications about your account, transactions, security, or policy changes.

### 11.3 Privacy requests

Depending on where you live and which laws apply, you may have rights to:

- know or access personal information;
- correct inaccurate personal information;
- delete personal information;
- receive a portable copy of certain information;
- object to or restrict certain processing;
- withdraw consent;
- opt out of sale, targeted advertising, or certain profiling; and
- appeal a decision on a privacy request.

To submit a request, email chevon@patternbreak.com with the subject **"Privacy Request."** Describe the request and the account email involved. We may take reasonable steps to verify your identity and authority before acting. An authorized agent may submit a request where permitted by law, subject to verification.

We will not discriminate against you for exercising applicable privacy rights. If applicable law provides an appeal right and you disagree with our response, reply with the subject **"Privacy Appeal"** and explain the basis for the appeal.

You may also lodge a complaint with the privacy or data-protection authority in your jurisdiction.

## 12. California notice at collection

This section describes categories of personal information we may collect, the sources, purposes, and categories of recipients. It covers the preceding 12 months and our current expected practices.

### Identifiers

Examples include email address, display name, account and payment-processor identifiers, IP address, and authentication records.

We collect identifiers from you, your browser or device, authentication providers, and Stripe. We use them to create and secure accounts, provide features, process subscriptions, communicate, prevent abuse, and comply with law. We disclose them to service providers, professional advisers, and authorities when legally required, and publicly only at your direction.

### Commercial information

Examples include plan, subscription, transaction, invoice, renewal, entitlement, cancellation, and support history.

We collect this information from you and Stripe. We use it for billing, account administration, fraud prevention, support, analytics, accounting, and legal compliance. We disclose it to payment, hosting, database, email, accounting, security, and support providers as needed.

### Internet or electronic-network activity

Examples include browser and device information, session and feature interactions, referring pages, login, download, export, error, and security logs.

We collect this information from your browser or device and service providers. We use it to operate, secure, diagnose, and improve the Service, enforce plan limits, and prevent abuse. We disclose it to hosting, analytics, security, and error-monitoring providers as needed.

### Approximate geolocation

We may infer a general city, region, or country from IP address for security, fraud prevention, localization, and aggregate analytics. We do not intentionally collect precise GPS location through the Service.

### User content and communications

Examples include projects, imported assets, project names, public profiles, support messages, feedback, and rights reports.

We collect this information from you. We use it to provide requested features, support you, operate public sharing at your direction, enforce the Terms, and improve the Service. We disclose it to service providers, advisers, authorities when required, and the public when you choose a public setting.

### Sensitive personal information

Account login credentials and authentication tokens may be considered sensitive personal information under some laws. Full payment-card details are collected by Stripe rather than stored by PatternBreak. We do not use sensitive personal information to infer characteristics about you and do not collect government identification numbers, biometric identifiers, precise geolocation, health data, or similarly sensitive information unless clearly disclosed for a specific future feature.

### Sale, sharing, and retention

We do not sell these categories or share them for cross-context behavioral advertising. We retain them as described in Section 9.

The California Consumer Privacy Act may apply only to businesses that meet statutory thresholds. Where it applies to PatternBreak, California residents may exercise the rights described in Section 11. Regardless of threshold status, we will generally honor verified access, correction, and deletion requests where reasonably possible and subject to legal exceptions.

## 13. Children and students

The Service is not directed to children under 13, and we do not knowingly collect personal information from a child under 13. If we learn that an under-13 child created an account or provided personal information without valid parental authorization, we will take reasonable steps to delete the information and close the account.

Users who are at least 13 but have not reached the age of majority where they live must have parent or legal-guardian permission. Student pricing does not make the Service a school record system. Do not upload protected education records or other regulated student data unless PatternBreak has entered a separate written agreement that expressly covers that use.

Parents or guardians may contact chevon@patternbreak.com regarding a minor's information.

California registered users under 18 may remove content they posted through available project, profile, or publishing controls, or may request removal by emailing chevon@patternbreak.com with the subject **"Minor Content Removal."** The request should identify the account and content to be removed. Removal makes the content no longer visible through the Service when reasonably possible, but it may not eliminate copies retained by law, anonymized records, third-party reposts, search caches, or content for which the user received compensation.

## 14. International data transfers

PatternBreak is based in the United States, and our service providers may process information in the United States and other countries. Those countries may have data-protection laws different from the laws where you live. Where required, we use contractual or other lawful transfer safeguards.

## 15. Third-party services and links

The Service may link to or interoperate with third-party websites, engines, plug-ins, marketplaces, authentication providers, or other services. Their privacy practices are governed by their own policies. Review them before providing information or connecting an account.

## 16. Changes to this Policy

We may update this Policy as the Service or law changes. We will post the revised version with a new effective date. If a change materially affects how we use personal information, we will provide additional notice through the Service, account email, or another reasonable method and obtain consent where required.

## 17. Contact

Questions or requests about privacy may be sent to:

**PatternBreak**  
Los Angeles, California, United States  
Email: chevon@patternbreak.com  
Subject line for requests: **Privacy Request**

