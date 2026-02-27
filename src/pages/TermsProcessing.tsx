import merchanthausLogo from "@/assets/merchanthaus-logo.png";

export default function TermsProcessing() {
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <header className="bg-card border-b border-border px-3 py-2.5 md:px-4 md:py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <img src={merchanthausLogo} alt="MerchantHaus" className="h-7 md:h-10 w-auto" />
          <a href="/merchant-apply" className="text-xs text-primary hover:underline">← Back to Application</a>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-6">Merchant Terms and Conditions</h1>
        <p className="text-sm text-muted-foreground mb-8">Version 1.0 — Effective February 2026</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-6">

          <p>As provided by the Merchant Application, Merchant, MerchantHaus LLC ("ISO") and Merrick Bank Corporation ("Bank") have agreed to be bound by these terms and conditions. Bank and ISO are collectively referred to herein as the "Provider" and, subject to the requirements of the Network Rules, ISO and Bank allocate the duties and obligations allocated to Provider as they deem appropriate in their sole discretion and may jointly or individually assert or exercise the rights or remedies provided to Provider hereunder. Bank, ISO and Merchant agree as follows:</p>

          <h2 className="text-lg font-bold mt-8 mb-4">ARTICLE I – DEFINITIONS</h2>
          <p>In addition to terms otherwise defined in this Agreement, capitalized terms shall have the meaning ascribed to them in this Article I.</p>
          <ol className="list-decimal pl-6 space-y-2 text-sm">
            <li><strong>"Account"</strong> means a commercial checking or demand deposit account maintained by Merchant for the crediting of collected funds and the debiting of fees and charges under this Agreement.</li>
            <li><strong>"ACH"</strong> means the Automated Clearing House paperless entry system controlled by the Federal Reserve Board.</li>
            <li><strong>"Agreement"</strong> or <strong>"Merchant Agreement"</strong> means the Merchant Application, the Guaranty and these Terms and Conditions, and any supplementary documents referenced herein, and schedules, exhibits and amendments to the foregoing.</li>
            <li><strong>"American Express"</strong> means the Cards bearing the Marks of, and Card Network operated by, American Express Travel Related Services Company, Inc. or its affiliates.</li>
            <li><strong>"Authorization"</strong> means a computerized function or a direct phone call to a designated number to examine individual Transactions to obtain approval from the Card Issuer to charge the Card for the amount of the sale in accordance with the terms of this Agreement and the Network Rules.</li>
            <li><strong>"Bank"</strong> has the meaning set forth on the Merchant Application.</li>
            <li><strong>"Card"</strong> means (i) a valid credit card or debit card in the form issued under license from a Card Network ("Bank Card"); or (ii) any other valid credit card or debit card or other payment device approved by Bank and accepted by Merchant.</li>
            <li><strong>"Card Issuer"</strong> means the financial institution or company which has provided a Card to a Cardholder.</li>
            <li><strong>"Card Network"</strong> means Visa U.S.A., Inc., MasterCard International, Inc., American Express Travel Related Services Company, Inc., DFS Services LLC (the owner of Discover) and their affiliates, or any other payment networks approved by Bank that provide Cards accepted by Merchant.</li>
            <li><strong>"Card Not Present" or "CNP"</strong> means that an Imprint of the Card is not obtained at the point-of-sale.</li>
            <li><strong>"Cardholder"</strong> shall mean any person authorized to use the Cards or the accounts established in connection with the Cards.</li>
            <li><strong>"Cardholder Information"</strong> means any non-public, sensitive information about a Cardholder or related to a Card, including, but not limited to, any combination of Cardholder name plus the Cardholder's social security number, driver's license or other identification number, or credit or debit card number, or other bank account number.</li>
            <li><strong>"Chargeback"</strong> means the procedure by which a Transaction (or disputed portion thereof) is returned to Provider by a Card Issuer for any reason.</li>
            <li><strong>"Credit Voucher"</strong> means a document executed by a Merchant evidencing any refund or price adjustment relating to Cards to be credited to a Cardholder account.</li>
            <li><strong>"Discover Card"</strong> means a Card bearing the Discover Marks and accepted as part of the DFS Services Network.</li>
            <li><strong>"Guarantor"</strong> has the meaning set forth on the Merchant Application.</li>
            <li><strong>"Guaranty"</strong> has the meaning set forth in Section 5.26 of this Agreement.</li>
            <li><strong>"Imprint"</strong> means (i) an impression on a Transaction Record manually obtained from a Card through the use of an imprinter, or (ii) the electronic equivalent obtained by swiping a Card through a terminal and electronically capturing Card data and printing a Transaction Record.</li>
            <li><strong>"ISO"</strong> means MerchantHaus LLC.</li>
            <li><strong>"Merchant"</strong> has the meaning set forth on the Merchant Application.</li>
            <li><strong>"Merchant Application"</strong> has the meaning set forth on the Merchant Application.</li>
            <li><strong>"Network Rules"</strong> means the rules, regulations, releases, interpretations and other requirements imposed or adopted by any Card Networks and related authorities, including without limitation, those of the PCI Security Standards Council, LLC and the National Automated Clearing House Association.</li>
            <li><strong>"Provider"</strong> means ISO and Bank together.</li>
            <li><strong>"Transaction"</strong> means any sale of products or services, or credit for such, from a Merchant for which the Cardholder makes payment through the use of any Card and which is presented to Provider for collection.</li>
            <li><strong>"Transaction Record"</strong> means evidence of a purchase, rental or lease of goods or services by a Cardholder from, and other payments to, Merchant using a Card.</li>
            <li><strong>"Voice Authorization"</strong> means a direct phone call to a designated number to obtain credit approval on a Transaction from the Card Issuer.</li>
          </ol>

          <h2 className="text-lg font-bold mt-8 mb-4">ARTICLE II – CARD ACCEPTANCE</h2>

          <h3 className="font-semibold mt-4">2.1 Honoring Cards</h3>
          <p className="text-sm">Merchant will accept all valid Cards when properly presented by Cardholders in payment for goods or services, subject to applicable Network Rules requiring Merchant to elect whether it will accept credit only, debit only or both debit and credit cards. Except to the extent explicitly provided by the Network Rules, Merchant may not establish minimum or maximum amounts for Card sales as a condition for accepting any Card. Merchant shall not engage in any acceptance practice that discriminates against or discourages the use of a Card Network's Cards in favor of any other Card Network's Cards.</p>

          <h3 className="font-semibold mt-4">2.2 Merchant's General Duties</h3>
          <p className="text-sm">Merchant will comply with this Agreement for submitting and processing Transactions. Merchant, and not Bank, is responsible for any advice from, acts of, as well as omissions, acts of fraud or acts of misconduct by, Merchant's employees, processors, consultants, advisors, contractors, merchant servicers, agents, officers and directors. Merchant agrees that if Merchant does not use point of sale equipment that has been certified EMV chip card compliant and enabled, Merchant may be liable for payment of any transactions submitted for chargeback by the applicable EMV chip card issuer(s).</p>

          <h3 className="font-semibold mt-4">2.3 Advertising</h3>
          <p className="text-sm">Subject to the Network Rules, Merchant will prominently display the promotional materials provided by Provider in its place(s) of business. Upon notification by any Card Network or Provider, or upon termination of this Agreement, Merchant shall discontinue the use of such Card Network's Marks and return any inventory or promotional materials to Provider.</p>

          <h3 className="font-semibold mt-4">2.4 Card Acceptance</h3>
          <p className="text-sm">Merchant has the option of accepting MasterCard credit cards, Visa credit cards, credit cards issued by Discover, American Express payment cards, MasterCard signature debit cards or Visa signature debit cards, or debit cards issued by Discover. If Merchant does not specifically indicate otherwise on the Merchant Application, the application will be processed to accept ALL MasterCard, Discover, Visa and American Express card types.</p>

          <h3 className="font-semibold mt-4">2.5 Authorization</h3>
          <p className="text-sm">Merchant will obtain an Authorization for all Transactions using a means approved by Provider. Provider will charge Merchant a $0.95 Voice Authorization Fee for each Voice Authorization that is initiated. Merchant acknowledges that an Authorization provides only that the Cardholder account has sufficient credit available and is not a guarantee that the Transaction will not be subject to dispute or Chargeback.</p>

          <h3 className="font-semibold mt-4">2.6 – 2.15 Additional Card Acceptance Terms</h3>
          <p className="text-sm">Merchant will comply with all additional requirements regarding retention and retrieval of Cards, multiple Transaction Records, telephone/mail/internet orders, lodging and vehicle rental Transactions, returns and adjustments, cash payments, cash advances, duplicate Transactions, fraudulent Transactions, and collection of pre-existing debt as set forth in the full Agreement.</p>

          <h3 className="font-semibold mt-4">2.16 Data Security / Personal Cardholder Information</h3>
          <p className="text-sm">Merchant agrees to implement commercially reasonable safeguards to protect Cardholder Information from unauthorized use, disclosure, modification or destruction. Merchant shall comply at all times with the Payment Card Industry Data Security Standard ("PCI DSS") and all other applicable Network Rules and Laws relating to the protection of Cardholder Information. In the event of a breach, Merchant shall immediately notify Provider.</p>

          <h3 className="font-semibold mt-4">2.17 – 2.26 Further Provisions</h3>
          <p className="text-sm">Additional provisions cover Merchant inspections, equipment, third-party agents, refund restrictions, settlement, recourse, pre-authorized transactions, healthcare transactions, recurring transactions, and limited acceptance. These provisions are incorporated by reference into this Agreement.</p>

          <h2 className="text-lg font-bold mt-8 mb-4">ARTICLE III – PRESENTMENT, PAYMENT, CHARGEBACK</h2>

          <h3 className="font-semibold mt-4">3.1 Acceptance</h3>
          <p className="text-sm">Provider will accept from Merchant all Transaction Records deposited under the terms of this Agreement. Merchant must transmit Transaction Records and Credit Vouchers to Provider on the same or next business day immediately following the day originated.</p>

          <h3 className="font-semibold mt-4">3.5 Chargebacks</h3>
          <p className="text-sm">Merchant will accept responsibility for all Chargebacks related to Merchant's Transactions. Merchant will be liable to Provider in the amount of any Transaction disputed by the Cardholder or Card Issuer for any reason under the Network Rules. A Chargeback fee of $25.00 will be billed to the Merchant by Provider for each Chargeback occurrence.</p>

          <h3 className="font-semibold mt-4">3.6 Reserve Account</h3>
          <p className="text-sm">Bank may establish a non-interest bearing reserve account ("Reserve Account") in an amount determined by Bank in its sole discretion. The Reserve Account may be established at any time including in cases of duplicate transactions, breach of Agreement, fraud, excessive chargebacks, or if Merchant's financial stability is in question.</p>

          <h2 className="text-lg font-bold mt-8 mb-4">ARTICLE IV – TERMINATION AND EFFECT OF TERMINATION</h2>

          <h3 className="font-semibold mt-4">4.1 Term</h3>
          <p className="text-sm">This Agreement will be effective once Provider accepts it and will continue with automatic one (1) year renewal terms unless Merchant provides written notice of non-renewal.</p>

          <h3 className="font-semibold mt-4">4.2 Termination</h3>
          <p className="text-sm">Provider may terminate this Agreement without cause upon thirty (30) days' advance written notice, or for cause immediately upon written or verbal notice if Provider reasonably determines violations exist including breach of Agreement, material adverse financial changes, false information, excessive chargebacks, or fraud.</p>

          <h3 className="font-semibold mt-4">4.4 Effect of Termination; Early Termination Fee</h3>
          <p className="text-sm">In the event of termination, Merchant will remain liable for all Transactions processed and all indemnification obligations. Provider may continue to debit Merchant's Account for fees, charges, and Chargebacks.</p>

          <h2 className="text-lg font-bold mt-8 mb-4">ARTICLE V – GENERAL PROVISIONS</h2>

          <h3 className="font-semibold mt-4">5.1 Entire Agreement</h3>
          <p className="text-sm">This Agreement, including all attachments, schedules and exhibits, constitutes the entire agreement between the parties concerning the subject matter hereof.</p>

          <h3 className="font-semibold mt-4">5.2 Amendment</h3>
          <p className="text-sm">Provider may amend this Agreement, including the pricing terms, at any time by providing Merchant with thirty (30) days' advance written notice. Merchant's processing of a Transaction following receipt of notice shall constitute acceptance of the amendment.</p>

          <h3 className="font-semibold mt-4">5.3 Assignment</h3>
          <p className="text-sm">Merchant may not assign this Agreement without the prior written consent of Provider. Provider may freely assign this Agreement.</p>

          <h3 className="font-semibold mt-4">5.4 Governing Law</h3>
          <p className="text-sm">This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware without regard to its conflict of law principles.</p>

          <h3 className="font-semibold mt-4">5.5 Indemnification</h3>
          <p className="text-sm">Merchant shall defend, indemnify, and hold harmless Provider and its affiliates from and against any and all claims, actions, proceedings, liabilities, damages, penalties, fines, costs or expenses arising out of or relating to Merchant's breach of this Agreement, violation of applicable laws or Network Rules, or any fraudulent or unauthorized Transactions.</p>

          <h3 className="font-semibold mt-4">5.6 Limitation of Liability</h3>
          <p className="text-sm">PROVIDER SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL OR EXEMPLARY DAMAGES HOWEVER ARISING. PROVIDER'S TOTAL LIABILITY SHALL NOT EXCEED THE AGGREGATE FEES RECEIVED FOR PROVIDING SERVICES DURING THE THIRTY (30) DAYS PRECEDING THE DATE ON WHICH THE CLAIM AROSE OR $1,500.00 USD, WHICHEVER IS LESS.</p>

          <h3 className="font-semibold mt-4">5.7 Warranty Disclaimer</h3>
          <p className="text-sm">SERVICES ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT ANY REPRESENTATIONS OR WARRANTIES. PROVIDER SPECIFICALLY DISCLAIMS ALL WARRANTIES WHETHER EXPRESS OR IMPLIED INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR TITLE.</p>

          <h3 className="font-semibold mt-4">5.8 Confidentiality</h3>
          <p className="text-sm">Each party that receives Confidential Information agrees to use reasonable best efforts to protect all Confidential Information and will only use such information to perform its obligations under this Agreement.</p>

          <h3 className="font-semibold mt-4">5.9 Survival</h3>
          <p className="text-sm">Sections relating to indemnification, limitation of liability, confidentiality, reserve accounts, and general provisions shall survive termination of this Agreement.</p>

          <h2 className="text-lg font-bold mt-8 mb-4">GATEWAY SERVICES TERMS</h2>
          <p className="text-sm">The following additional terms apply if Merchant utilizes MerchantHaus gateway services powered by NMI Payments.</p>

          <h3 className="font-semibold mt-4">Gateway Service Grant</h3>
          <p className="text-sm">You are granted a limited, revocable, non-transferable, non-sublicensable, non-exclusive right to use the Gateway Services during the Term so long as You are in compliance with this Agreement, including being current in paying all applicable fees. Your use of the Gateway Services shall be restricted to You. You shall not submit Data or otherwise process orders on behalf of any other entity not permitted under this Agreement.</p>

          <h3 className="font-semibold mt-4">Data Security</h3>
          <p className="text-sm">MerchantHaus will collect, retain, use and share information and Data collected from You and Your customers in accordance with our Privacy Policy. You are solely responsible for the security of Data residing on servers owned or operated by You. You shall comply with all applicable laws and PCI DSS requirements governing the collection, retention and use of payment card and financial information.</p>

          <h3 className="font-semibold mt-4">Fees</h3>
          <p className="text-sm">You shall pay fees as set forth in the Fee Schedule. MerchantHaus may modify or update the Fee Schedule with 30 days' prior notice. A Return Payment Fee of $25.00 USD will be charged for each unsuccessful debit.</p>

          <h3 className="font-semibold mt-4">Termination of Gateway Services</h3>
          <p className="text-sm">Either party may terminate gateway services with thirty (30) days' written notice. MerchantHaus may terminate immediately in cases of breach, fraud, or if required by a third-party service provider or card association.</p>

          <div className="mt-12 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              © {new Date().getFullYear()} MerchantHaus LLC. All rights reserved. <br />
              These Terms and Conditions are proprietary to MerchantHaus LLC and may not be reproduced without permission.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
