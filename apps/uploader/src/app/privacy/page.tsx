// Privacy Policy for Courssy TikTok Uploader
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Courssy",
  description: "Privacy Policy for Courssy, in compliance with GDPR.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: "#080808", fontFamily: "'Manrope', sans-serif" }}>
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1a1a1a] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/[0.08]">
              <img src="/icon.png" alt="Courssy Logo" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-white">Courssy</span>
          </div>
          <Link href="/" className="text-sm text-gray-400 hover:text-white transition">← Back</Link>
        </div>
      </nav>

      <div className="pt-28 px-6 pb-20">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-extrabold text-white mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-10">courssy.com · Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

          <div className="space-y-8 text-gray-400 text-sm leading-relaxed">

            <section>
              <h2 className="text-lg font-bold text-white mb-3">1. Data Controller</h2>
              <p>The data controller of your personal data is:</p>
              <div className="mt-3 rounded-xl border border-[#222] p-4" style={{ background: "#0a0a0a" }}>
                <p className="font-semibold text-white">Courssy</p>
                <p>Email: <span className="text-[#25F4EE]">info@courssy.com</span></p>
                <p>Website: <span className="text-[#25F4EE]">courssy.com</span></p>
              </div>
              <p className="mt-3">For any questions regarding the processing of your personal data, contact us at info@courssy.com.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">2. Data Collected from TikTok</h2>
              <p>When you use Courssy with your TikTok account, Courssy receives the following data from TikTok, according to the OAuth scopes you authorized:</p>
              <table className="mt-3 w-full rounded-xl border border-[#222] overflow-hidden text-xs">
                <thead>
                  <tr style={{ background: "#111" }}>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Data</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">TikTok Scope</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222]">
                  {[
                    ["Open ID (unique identifier)", "user.info.basic", "Unique account identification"],
                    ["Display name / Username", "user.info.basic", "Displaying your name in the dashboard"],
                    ["Avatar URL", "user.info.basic", "Displaying your profile picture"],
                    ["Bio / Profile description", "user.info.profile", "Displaying additional profile details"],
                    ["Video Upload (Draft)", "video.upload", "Initializing and uploading videos to TikTok"],
                  ].map(([dato, scope, fine]) => (
                    <tr key={dato}>
                      <td className="px-4 py-3 text-white">{dato}</td>
                      <td className="px-4 py-3 text-[#25F4EE] font-mono">{scope}</td>
                      <td className="px-4 py-3 text-gray-500">{fine}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3">We do not collect, store, or process TikTok data outside of the session token necessary for video uploads. The uploaded videos are sent directly to the official TikTok Inc. APIs and are never stored or retained by Courssy. Profile data is not stored in any database; it only exists during the active session.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">3. Legal Basis for Processing (GDPR)</h2>
              <p>The processing of TikTok data in Courssy is based on:</p>
              <div className="mt-3 rounded-xl border border-[#25F4EE]/30 bg-[#25F4EE]/5 p-4">
                <p className="font-semibold text-[#25F4EE]">Art. 6(1)(b) GDPR — Performance of a contract</p>
                <p className="mt-1 text-gray-400 text-xs">The user explicitly requests to upload videos to their TikTok account. Processing is necessary to fulfill this request.</p>
              </div>
              <p className="mt-3">For profile data (bio), processing is based on explicit consent (Art. 6(1)(a) GDPR) provided during the TikTok OAuth flow.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">4. Storage and Security</h2>
              <ul className="mt-2 space-y-2 list-disc list-inside">
                <li><strong className="text-white">Access token:</strong> Stored in an httpOnly cookie with secure flag and sameSite=lax. The cookie is restricted to the domain courssy.com and has an expiration duration matching the TikTok token (max 24h).</li>
                <li><strong className="text-white">No Database:</strong> Courssy does not use any databases to store TikTok data. Profile data is not persistently saved.</li>
                <li><strong className="text-white">Infrastructure:</strong> The app is hosted on Vercel (EU/US infrastructure) with mandatory HTTPS connections.</li>
                <li><strong className="text-white">Encryption:</strong> All communications between the browser and servers are encrypted using TLS 1.2+.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">5. Third-Party Sharing</h2>
              <p>Courssy does not share, sell, rent, or otherwise transfer users' TikTok data to third parties.</p>
              <p className="mt-2">Data is shared with TikTok Inc. exclusively for the following purposes:</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>OAuth Authentication (TikTok Login Kit)</li>
                <li>Video Uploading (TikTok Content Posting API)</li>
              </ul>
              <p className="mt-2">For the processing of data by TikTok Inc., please refer to the <a href="https://www.tiktok.com/legal/privacy-policy" target="_blank" rel="noopener" className="text-[#25F4EE] hover:underline">TikTok Privacy Policy</a>.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">6. User Rights (GDPR)</h2>
              <p>Under GDPR, you have the following rights regarding your personal data:</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li><strong>Right of Access (Art. 15):</strong> Request a copy of the data Courssy received from TikTok for your account</li>
                <li><strong>Right to Erasure (Art. 17):</strong> Withdraw consent and request data removal — revoke TikTok access from your TikTok account settings</li>
                <li><strong>Right to Withdraw Consent:</strong> Revoke access to Courssy at any time from your TikTok account settings on tiktok.com</li>
                <li><strong>Right to Portability (Art. 20):</strong> Receive your data in a structured, readable format</li>
              </ul>
              <p className="mt-3">To exercise your rights, please contact us at <span className="text-[#25F4EE]">info@courssy.com</span>.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">7. Data Deletion Instructions</h2>
              <p>You can request the deletion of your account data or revoke access at any time. To do so, follow these steps:</p>
              <ol className="mt-2 space-y-2 list-decimal list-inside">
                <li>Go to your TikTok profile settings.</li>
                <li>Navigate to <strong>Security and login</strong> &gt; <strong>Manage app access</strong>.</li>
                <li>Select <strong>Courssy</strong> and click <strong>Remove access</strong>.</li>
                <li>Alternatively, send an email to <span className="text-[#25F4EE]">info@courssy.com</span> requesting data deletion, and we will delete any session data associated with your account within 48 hours.</li>
              </ol>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">8. Video Uploads and Content Data</h2>
              <p>Videos uploaded through Courssy are sent directly to TikTok Inc. APIs. Courssy does not store, copy, or retain uploaded videos. Videos are processed by TikTok Inc. according to their <a href="https://www.tiktok.com/legal/privacy-policy" target="_blank" rel="noopener" className="text-[#25F4EE] hover:underline">Privacy Policy</a>.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">8. Cookie Policy</h2>
              <p>Courssy uses the following cookies:</p>
              <table className="mt-3 w-full rounded-xl border border-[#222] overflow-hidden text-xs">
                <thead>
                  <tr style={{ background: "#111" }}>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Name</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Type</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Duration</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222]">
                  {[
                    ["tiktok_access_token", "httpOnly, secure", "Session (max 24h)", "TikTok OAuth Authentication"],
                    ["tiktok_open_id", "httpOnly, secure", "Session (max 24h)", "TikTok Unique Identifier"],
                  ].map(([name, type, duration, purpose]) => (
                    <tr key={name}>
                      <td className="px-4 py-3 text-white font-mono">{name}</td>
                      <td className="px-4 py-3 text-gray-500">{type}</td>
                      <td className="px-4 py-3 text-gray-500">{duration}</td>
                      <td className="px-4 py-3 text-gray-500">{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3">We do not use any profiling, marketing, or third-party analytics cookies.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">9. Data Retention</h2>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li><strong className="text-white">Access token:</strong> Automatically deleted upon expiration (max 24h) or when logging out</li>
                <li><strong className="text-white">Profile data:</strong> Not stored persistently — only exists during the active session</li>
                <li><strong className="text-white">System logs:</strong> Server logs are retained for max 30 days for security and debugging purposes</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">10. Changes to the Privacy Policy</h2>
              <p>We reserve the right to modify this Privacy Policy at any time. Changes will be posted on this page. We will notify you of any significant changes via a visible notification upon your first access after the modification.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">11. Complaints</h2>
              <p>You have the right to file a complaint with a supervisory authority (such as the Italian Garante per la Protezione dei Dati Personali at www.garanteprivacy.it) if you believe the processing of your data violates the GDPR.</p>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}