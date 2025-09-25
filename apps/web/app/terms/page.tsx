import Image from "next/image";

export default function TermsOfService() {
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <Image
              src="/icon-192x192.png"
              alt="Dojo Pomodoro"
              width={64}
              height={64}
              className="mr-4"
            />
            <h1 className="text-4xl font-bold text-primary">Terms of Service</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            These terms govern your use of Dojo Pomodoro, our event management platform for exclusive gatherings and experiences.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-gray max-w-none dark:prose-invert">
          <div className="bg-card rounded-lg p-8 border shadow-sm space-y-8">

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">1. Acceptance of Terms</h2>
              <p>
                By creating an account, accessing, or using Dojo Pomodoro (&ldquo;Service&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;).
                If you disagree with any part of these terms, you may not access the Service.
              </p>
              <p className="mt-3 font-semibold text-primary">
                By signing up for Dojo Pomodoro, you automatically consent to receive SMS notifications for events you RSVP to,
                including event updates, confirmations, and important announcements.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">2. Description of Service</h2>
              <p>
                Dojo Pomodoro is an event management platform that allows hosts to create exclusive events and manage guest lists,
                while providing guests with secure access through password-protected RSVPs and digital tickets.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">3. User Accounts and Registration</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>You must provide accurate, current, and complete information during registration</li>
                <li>You are responsible for safeguarding your account credentials</li>
                <li>You must notify us immediately of any unauthorized use of your account</li>
                <li>We reserve the right to suspend or terminate accounts that violate these terms</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">4. SMS and Text Messaging Services</h2>
              <div className="bg-orange-50 dark:bg-orange-900/20 p-6 rounded-lg border border-orange-200 dark:border-orange-800">
                <h3 className="text-xl font-semibold text-primary mb-3">SMS Service and Terms</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>By creating an account with Dojo Pomodoro, you automatically consent to receive SMS notifications for events you RSVP to</li>
                  <li>Message frequency varies based on event activity and your RSVP status</li>
                  <li>Message and data rates may apply from your wireless carrier</li>
                  <li>We use Twilio as our SMS service provider to deliver messages securely</li>
                  <li>You can opt-out at any time by texting STOP to any message we send</li>
                  <li>Text HELP for assistance or contact us directly through the platform</li>
                  <li>We will not share your phone number with third parties except as required for service delivery</li>
                  <li>SMS notifications are essential for event coordination and your account security</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">5. Event Access and Passwords</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Event access is controlled through password-protected guest lists</li>
                <li>Do not share event passwords with unauthorized individuals</li>
                <li>Event hosts reserve the right to approve or deny RSVP requests</li>
                <li>Digital tickets are non-transferable unless explicitly permitted by the host</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">6. Privacy and Data Protection</h2>
              <p>
                Your privacy is important to us. Please review our <a href="/privacy" className="text-primary hover:underline font-semibold">Privacy Policy</a> to
                understand how we collect, use, and protect your personal information. We comply with applicable data protection
                laws including GDPR and CCPA.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">7. User Conduct</h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Use the Service for any unlawful purpose or in violation of any laws</li>
                <li>Impersonate another person or entity</li>
                <li>Interfere with or disrupt the Service or servers connected to the Service</li>
                <li>Attempt to gain unauthorized access to any portion of the Service</li>
                <li>Harass, abuse, or harm other users</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">8. Intellectual Property</h2>
              <p>
                The Service and its original content, features, and functionality are owned by Dojo Pomodoro and are protected by
                international copyright, trademark, patent, trade secret, and other intellectual property laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">9. Limitation of Liability</h2>
              <p>
                In no event shall Dojo Pomodoro, its directors, employees, partners, agents, suppliers, or affiliates be liable for
                any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits,
                data, use, goodwill, or other intangible losses.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">10. Termination</h2>
              <p>
                We may terminate or suspend your account and access to the Service immediately, without prior notice, for conduct
                that we believe violates these Terms or is harmful to other users, us, or third parties.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">11. Changes to Terms</h2>
              <p>
                We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at
                least 30 days notice prior to any new terms taking effect.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">12. Contact Information</h2>
              <p>
                If you have any questions about these Terms, please contact us through our platform or visit our website at{" "}
                <a href="https://dojopomodoro.club" className="text-primary hover:underline font-semibold">
                  dojopomodoro.club
                </a>.
              </p>
            </section>

          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-12 text-center space-x-6">
          <a href="/privacy" className="text-primary hover:underline font-medium">
            Privacy Policy
          </a>
          <a href="/cookies" className="text-primary hover:underline font-medium">
            Cookies Policy
          </a>
          <a href="/data" className="text-primary hover:underline font-medium">
            Data Collection
          </a>
        </div>
      </div>
    </main>
  );
}