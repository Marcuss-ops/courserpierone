// Terms of Service for Courssy TikTok Uploader
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Courssy",
  description: "Terms of Service for Courssy, the video upload application for TikTok.",
};

export default function TermsPage() {
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
          <h1 className="text-4xl font-extrabold text-white mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500 mb-10">uploader.courssy.com · Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

          <div className="space-y-8 text-gray-400 text-sm leading-relaxed">

            <section>
              <h2 className="text-lg font-bold text-white mb-3">1. Introduction</h2>
              <p>Welcome to Courssy ("the Service"), a web application that allows users to upload videos to their TikTok account using the official TikTok APIs (TikTok Login Kit and Content Posting API).</p>
              <p className="mt-2">By using the Service, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the Service.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">2. Description of the Service</h2>
              <p>Courssy acts as an interface between you and the TikTok APIs. The Service allows you to:</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Authenticate with your TikTok account via OAuth 2.0 (TikTok Login Kit)</li>
                <li>Upload videos to your TikTok account as draft (TikTok Content Posting API)</li>
                <li>Manage privacy settings, comments, Duet, and share settings for each video</li>
              </ul>
              <p className="mt-2">Courssy is not affiliated with, sponsored, or endorsed by TikTok, Inc.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">3. Account and Authentication</h2>
              <p>Authentication is handled exclusively via TikTok Login Kit. Courssy does not store TikTok passwords. The access token is stored in an httpOnly cookie on the user's device and can be revoked at any time.</p>
              <p className="mt-2">The user is responsible for maintaining the security of their TikTok account and for all activities that occur through their account.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">4. Uploaded Content</h2>
              <p>The user is solely responsible for the content uploaded through Courssy. By uploading content to TikTok, the user confirms that they:</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Own or have the necessary rights to upload such content</li>
                <li>Comply with the <a href="https://www.tiktok.com/community-guidelines" target="_blank" rel="noopener" className="text-[#25F4EE] hover:underline">TikTok Community Guidelines</a></li>
                <li>Comply with the TikTok <a href="https://www.tiktok.com/music-usage-confirmation" target="_blank" rel="noopener" className="text-[#25F4EE] hover:underline">Music Usage Confirmation</a> for content with music</li>
                <li>Do not violate third-party rights, including copyright, trademarks, and privacy</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">5. Restrictions on Use</h2>
              <p>It is forbidden to use Courssy to:</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Upload content that violates TikTok's Community Guidelines</li>
                <li>Upload copyrighted content without valid rights</li>
                <li>Spam, fraudulent engagement, or manipulation of TikTok metrics</li>
                <li>Illegal activities or activities that violate third-party rights</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">6. Limitation of Liability</h2>
              <p>Courssy is provided "as is". We do not guarantee that the Service will always be available, error-free, or meet your specific requirements.</p>
              <p className="mt-2">Courssy is not responsible for actions taken by TikTok Inc. regarding your account, including suspensions, content removals, or API changes.</p>
              <p className="mt-2">In no event shall Courssy be liable for any direct, indirect, incidental, special, or consequential damages arising out of the use of the Service.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">7. Modifications to the Terms</h2>
              <p>We reserve the right to modify these Terms at any time. Changes will be posted on this page with an updated "Last updated" date. Your continued use of the Service after changes constitutes acceptance of the new Terms.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">8. Governing Law</h2>
              <p>These Terms are governed by Italian law. For any dispute, the competent court is that of Milan, Italy.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-3">9. Contact Us</h2>
              <p>For questions regarding these Terms, please contact us at:</p>
              <p className="mt-2 text-[#25F4EE]">info@courssy.com</p>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
