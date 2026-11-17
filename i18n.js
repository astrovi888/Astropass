/* AstroVault LANGUAGES (i18n.js): English / Français / العربية with right-to-left layout for Arabic.
   HOW IT WORKS: the app is written in English. This file keeps a dictionary [English, French, Arabic] and a MutationObserver that translates any
   screen text the moment it appears (pages, sheets, toasts). No other file needs to change when you add a sentence:
   just add one line [English text exactly as shown, French, Arabic] to W below, or a pattern to RX for text with numbers/names inside.
   Staff screens, Terms and Privacy stay in English on purpose (legal text should be reviewed by a human translator). */
(function(){
"use strict";
const A=window.AV;if(!A)return;
let L=localStorage.getItem("av_lang")||(navigator.language||"en").slice(0,2).toLowerCase();if(L!=="fr"&&L!=="ar")L="en";
A.lang=L;document.documentElement.lang=L;if(L==="ar")document.documentElement.dir="rtl";
// language picker in the footer + account page
const foot=document.getElementById("foot");
if(foot)foot.insertAdjacentHTML("beforeend",'<div class="lang">🌐 <select id="lang2" aria-label="Language"><option value="en">English</option><option value="fr">Français</option><option value="ar">العربية</option></select></div>');
const s2=document.getElementById("lang2");if(s2)s2.value=L;
document.addEventListener("change",e=>{if(e.target.id==="lang"||e.target.id==="lang2"){try{localStorage.setItem("av_lang",e.target.value)}catch(x){}location.reload()}});
if(L==="en")return;
const I=L==="fr"?1:2;
const W=[
// navigation + header
["Shop","Boutique","المتجر"],["Wallet","Portefeuille","المحفظة"],["Orders","Commandes","الطلبات"],["Help","Aide","المساعدة"],["Account","Compte","الحساب"],["Staff","Équipe","الفريق"],
["Log in","Connexion","تسجيل الدخول"],["＋ Add money","＋ Ajouter de l’argent","＋ إضافة رصيد"],["Notifications","Notifications","الإشعارات"],["Nothing yet.","Rien pour le moment.","لا شيء بعد."],
// shop
["Subscriptions and game top-ups at friendlier prices.","Abonnements et recharges de jeux à de meilleurs prix.","اشتراكات وشحن ألعاب بأسعار أفضل."],
["Add money","Ajouter de l’argent","إضافة رصيد"],["to your wallet","à votre portefeuille","إلى محفظتك"],["Pick a product","Choisissez un produit","اختر منتجاً"],["and tap Buy","puis appuyez sur Acheter","ثم اضغط شراء"],
["Get it","Recevez-le","استلمه"],["instantly or in hours","immédiatement ou en quelques heures","فوراً أو خلال ساعات"],["New here?","Nouveau ici ?","جديد هنا؟"],
["See how it works (30 seconds)","Voir comment ça marche (30 secondes)","شاهد كيف يعمل (30 ثانية)"],
["🔒 Verified payments","🔒 Paiements vérifiés","🔒 مدفوعات موثّقة"],["↩️ Refund if we can’t deliver","↩️ Remboursement si nous ne pouvons pas livrer","↩️ استرداد إذا تعذّر التسليم"],["💬 Human support","💬 Support humain","💬 دعم بشري"],
["Search products or brands","Rechercher produits ou marques","ابحث عن منتجات أو علامات"],["Filters & my country","Filtres et mon pays","التصفية وبلدي"],
["My country (we show what works for you)","Mon pays (nous affichons ce qui vous convient)","بلدي (نعرض ما يناسبك)"],["Not set","Non défini","غير محدد"],["Brand","Marque","العلامة التجارية"],["All brands","Toutes les marques","كل العلامات"],
["Type","Type","النوع"],["All types","Tous les types","كل الأنواع"],["Sort by","Trier par","ترتيب حسب"],["Recommended","Recommandé","موصى به"],["Best selling","Meilleures ventes","الأكثر مبيعاً"],
["Price: low to high","Prix : croissant","السعر: من الأقل"],["Price: high to low","Prix : décroissant","السعر: من الأعلى"],
["All","Tout","الكل"],["AI Tools","Outils IA","أدوات الذكاء الاصطناعي"],["Entertainment","Divertissement","ترفيه"],["Productivity","Productivité","إنتاجية"],["Games","Jeux","ألعاب"],
["Loading…","Chargement…","جارٍ التحميل…"],["Nothing here yet.","Rien ici pour le moment.","لا يوجد شيء هنا بعد."],
["🔥 Trending","🔥 Tendance","🔥 رائج"],["⭐ Featured","⭐ À la une","⭐ مميز"],["⚡ Instant","⚡ Instantané","⚡ فوري"],["🕒 On request","🕒 Sur demande","🕒 عند الطلب"],["Coming soon","Bientôt disponible","قريباً"],
["Sold out","Épuisé","نفد"],["New","Nouveau","جديد"],["🌍 Worldwide","🌍 Monde entier","🌍 حول العالم"],["No reviews yet","Pas encore d’avis","لا توجد تقييمات بعد"],
["⏸️ The store is temporarily closed. You can browse, but purchases are paused.","⏸️ La boutique est temporairement fermée. Vous pouvez parcourir, mais les achats sont suspendus.","⏸️ المتجر مغلق مؤقتاً. يمكنك التصفح لكن الشراء متوقف."],
["🔒 Your account is under review. Please contact support.","🔒 Votre compte est en cours de vérification. Veuillez contacter le support.","🔒 حسابك قيد المراجعة. يرجى التواصل مع الدعم."],
// offer page
["Can be activated in","Activable dans","يمكن تفعيله في"],["Delivery","Livraison","التسليم"],["Average delivery","Livraison moyenne","متوسط التسليم"],["In stock","En stock","المخزون"],["Orders completed","Commandes terminées","الطلبات المكتملة"],
["Available","Disponible","متوفر"],["Warranty","Garantie","الضمان"],["Terms & warranty","Conditions et garantie","الشروط والضمان"],["Your balance","Votre solde","رصيدك"],
["💬 Chat with us about this offer","💬 Discuter de cette offre avec nous","💬 تحدّث معنا عن هذا العرض"],["Log in to buy","Connectez-vous pour acheter","سجّل الدخول للشراء"],
["Not available in your country","Indisponible dans votre pays","غير متاح في بلدك"],["Account under review","Compte en cours de vérification","الحساب قيد المراجعة"],["Store temporarily closed","Boutique temporairement fermée","المتجر مغلق مؤقتاً"],
["🔔 Notify me when back","🔔 Me prévenir du retour","🔔 أعلمني عند التوفر"],
["🔒 Paid from your wallet · ↩️ Refunded if we can’t deliver · 💬 Chat with us anytime","🔒 Payé depuis votre portefeuille · ↩️ Remboursé si nous ne pouvons pas livrer · 💬 Discutez avec nous à tout moment","🔒 الدفع من محفظتك · ↩️ استرداد إذا تعذّر التسليم · 💬 تحدّث معنا في أي وقت"],
["🔒 For your security, this payment method needs a quick one-time identity check (about 1 minute).","🔒 Pour votre sécurité, ce mode de paiement nécessite une vérification d’identité rapide, une seule fois (environ 1 minute).","🔒 لأمانك، تتطلب طريقة الدفع هذه تحققاً سريعاً من الهوية مرة واحدة (حوالي دقيقة)."],
["Your details","Vos informations","بياناتك"],["Verify phone","Vérifier le téléphone","التحقق من الهاتف"],["Selfie","Selfie","صورة شخصية"],
["I am 18 or older, and I agree that AstroVault stores my name, phone number and selfie to prevent fraud (only security staff can see them).","J’ai 18 ans ou plus et j’accepte qu’AstroVault conserve mon nom, mon numéro de téléphone et mon selfie pour prévenir la fraude (seule l’équipe sécurité peut les voir).","عمري 18 عاماً أو أكثر، وأوافق على أن يحتفظ AstroVault باسمي ورقم هاتفي وصورتي الشخصية لمنع الاحتيال (لا يراها سوى فريق الأمان)."],
["Continue","Continuer","متابعة"],["Please tick the box to continue.","Veuillez cocher la case pour continuer.","يرجى تحديد المربع للمتابعة."],["Could not save your details.","Impossible d’enregistrer vos informations.","تعذّر حفظ بياناتك."],
["This phone number is linked to another account. Please contact support.","Ce numéro est lié à un autre compte. Veuillez contacter le support.","هذا الرقم مرتبط بحساب آخر. يرجى التواصل مع الدعم."],
["✈️ Verify with Telegram","✈️ Vérifier avec Telegram","✈️ التحقق عبر تيليغرام"],["Telegram opens, tap “Share my phone number”, then come back here. Free and takes 10 seconds.","Telegram s’ouvre : touchez « Share my phone number », puis revenez ici. Gratuit, 10 secondes.","يفتح تيليغرام: اضغط «Share my phone number» ثم عد إلى هنا. مجاني ويستغرق 10 ثوانٍ."],
["Phone verification is done by our team. Message us on Telegram and we will confirm it quickly.","La vérification du téléphone est faite par notre équipe. Écrivez-nous sur Telegram et nous confirmerons rapidement.","يتم التحقق من الهاتف عبر فريقنا. راسلنا على تيليغرام وسنؤكده بسرعة."],
["Last step: take a live selfie with your phone camera. Your face must be clearly visible. Photos from your gallery are not accepted.","Dernière étape : prenez un selfie en direct avec la caméra de votre téléphone. Votre visage doit être bien visible. Les photos de la galerie ne sont pas acceptées.","الخطوة الأخيرة: التقط صورة شخصية مباشرة بكاميرا هاتفك. يجب أن يكون وجهك واضحاً. لا تُقبل الصور من المعرض."],
["📷 Take selfie","📷 Prendre un selfie","📷 التقاط صورة"],["Live selfie","Selfie en direct","صورة شخصية مباشرة"],["Look at the camera in good light. We use this only to protect against fraud.","Regardez la caméra avec une bonne lumière. Nous l’utilisons uniquement pour prévenir la fraude.","انظر إلى الكاميرا في إضاءة جيدة. نستخدمها فقط للحماية من الاحتيال."],
["📸 Take photo","📸 Prendre la photo","📸 التقاط الصورة"],["Camera is not ready yet.","La caméra n’est pas encore prête.","الكاميرا غير جاهزة بعد."],["Uploading…","Envoi en cours…","جارٍ الرفع…"],["✅ Identity check complete","✅ Vérification d’identité terminée","✅ اكتمل التحقق من الهوية"],["✅ Phone verified","✅ Téléphone vérifié","✅ تم التحقق من الهاتف"],
["Country (optional)","Pays (facultatif)","البلد (اختياري)"],["Prefer not to say","Préfère ne pas dire","أفضّل عدم الذكر"],["I am 18 or older.","J’ai 18 ans ou plus.","عمري 18 عاماً أو أكثر."],
["Please complete the identity check first.","Veuillez d’abord terminer la vérification d’identité.","يرجى إكمال التحقق من الهوية أولاً."],
["Cancel","Annuler","إلغاء"],["Confirm","Confirmer","تأكيد"],["Processing…","Traitement…","جارٍ المعالجة…"],["Try again","Réessayer","حاول مجدداً"],
["Purchased! 🎉","Achat réussi ! 🎉","تم الشراء! 🎉"],["Order received","Commande reçue","تم استلام الطلب"],["Keep shopping","Continuer mes achats","متابعة التسوق"],["My orders","Mes commandes","طلباتي"],["Copy","Copier","نسخ"],
["Copy details","Copier les détails","نسخ التفاصيل"],["Copy address","Copier l’adresse","نسخ العنوان"],["Copy amount","Copier le montant","نسخ المبلغ"],["Copy my link","Copier mon lien","نسخ رابطي"],["Copied","Copié","تم النسخ"],
["Please fill in the field above.","Veuillez remplir le champ ci-dessus.","يرجى ملء الحقل أعلاه."],
// wallet
["Wallet balance","Solde du portefeuille","رصيد المحفظة"],["$1 = 1.00 site balance","1 $ = 1,00 de solde","1$ = 1.00 رصيد"],["Add money to your wallet, then spend it in the shop. Three quick steps.","Ajoutez de l’argent à votre portefeuille, puis dépensez-le dans la boutique. Trois étapes rapides.","أضف رصيداً إلى محفظتك ثم أنفقه في المتجر. ثلاث خطوات سريعة."],
["② How do you want to pay?","② Comment voulez-vous payer ?","② كيف تريد الدفع؟"],["③ I’ve paid: send proof","③ J’ai payé : envoyer la preuve","③ لقد دفعت: أرسل الإثبات"],["Already paid but not credited? Send proof","Déjà payé mais non crédité ? Envoyez la preuve","دفعت ولم يُضف الرصيد؟ أرسل الإثبات"],
["③ I’ve paid: send proof so we can add the money","③ J’ai payé : envoyez la preuve pour que nous ajoutions l’argent","③ لقد دفعت: أرسل الإثبات لنضيف المبلغ"],
["No payment method is set up yet.","Aucun mode de paiement n’est configuré.","لم يتم إعداد طريقة دفع بعد."],["Name on the payment (sender name)","Nom sur le paiement (nom de l’expéditeur)","الاسم على الدفعة (اسم المرسل)"],
["Screenshot of the payment (PNG/JPG, max 5 MB)","Capture d’écran du paiement (PNG/JPG, 5 Mo max)","لقطة شاشة للدفع (PNG/JPG، 5 ميغابايت كحد أقصى)"],["Submit for verification","Envoyer pour vérification","إرسال للتحقق"],
["Top-up requests","Demandes de recharge","طلبات الشحن"],["Activity","Activité","النشاط"],["None yet.","Aucune pour le moment.","لا شيء بعد."],["No activity yet.","Aucune activité pour le moment.","لا يوجد نشاط بعد."],
["🎟️ Have a promo code?","🎟️ Vous avez un code promo ?","🎟️ هل لديك رمز ترويجي؟"],["Redeem","Utiliser","استخدام"],["Pay automatically","Payer automatiquement","ادفع تلقائياً"],["You will send","Vous enverrez","سترسل"],
["Full name (as on your payment account)","Nom complet (comme sur votre compte de paiement)","الاسم الكامل (كما في حساب الدفع)"],["Mobile number","Numéro de mobile","رقم الهاتف المحمول"],
["Open the D17 app","Ouvrez l’application D17","افتح تطبيق D17"],
["Open D17 → scan this QR → send the exact amount in TND shown above. Then upload a screenshot of the D17 confirmation. We check every D17 payment by hand.","Ouvrez D17 → scannez ce QR → envoyez le montant exact en TND indiqué ci-dessus. Puis téléversez une capture d’écran de la confirmation D17. Nous vérifions chaque paiement D17 manuellement.","افتح D17 ← امسح هذا الرمز ← أرسل المبلغ الدقيق بالدينار التونسي المعروض أعلاه. ثم ارفع لقطة شاشة لتأكيد D17. نراجع كل دفعة D17 يدوياً."],
["pending","en attente","قيد الانتظار"],["verified","vérifié","تم التحقق"],["rejected","refusé","مرفوض"],
// orders
["My orders","Mes commandes","طلباتي"],["Pending","En attente","قيد الانتظار"],["Processing","En cours","قيد المعالجة"],["Completed","Terminée","مكتملة"],["Cancelled","Annulée","ملغاة"],
["Pending = received · Processing = we’re working on it · Completed = delivered. Tap an order for details.","En attente = reçue · En cours = nous y travaillons · Terminée = livrée. Touchez une commande pour les détails.","قيد الانتظار = تم الاستلام · قيد المعالجة = نعمل عليه · مكتملة = تم التسليم. اضغط على الطلب للتفاصيل."],
["No orders yet","Aucune commande pour le moment","لا توجد طلبات بعد"],["Your purchases will show up here.","Vos achats apparaîtront ici.","ستظهر مشترياتك هنا."],["Browse the shop","Parcourir la boutique","تصفح المتجر"],
["We’re working on it and you’ll get a notification when it’s ready.","Nous y travaillons et vous serez notifié quand ce sera prêt.","نعمل عليه وسيصلك إشعار عندما يصبح جاهزاً."],["Need help with this order?","Besoin d’aide pour cette commande ?","هل تحتاج مساعدة بخصوص هذا الطلب؟"],
["How was it?","Comment c’était ?","كيف كانت التجربة؟"],["👍 Good","👍 Bien","👍 جيد"],["👎 Not good","👎 Pas bien","👎 غير جيد"],["Send review","Envoyer l’avis","إرسال التقييم"],["Optional comment","Commentaire facultatif","تعليق اختياري"],["🔁 Renew","🔁 Renouveler","🔁 تجديد"],
// account
["Settings","Paramètres","الإعدادات"],["Appearance","Apparence","المظهر"],["Auto","Auto","تلقائي"],["Light","Clair","فاتح"],["Dark","Sombre","داكن"],["Language","Langue","اللغة"],
["Email me order and support updates","Recevoir par e-mail les mises à jour de commandes et du support","أرسل لي تحديثات الطلبات والدعم عبر البريد"],["Security","Sécurité","الأمان"],
["We never ask for your password or codes. Staff will never message you first asking for them.","Nous ne demandons jamais votre mot de passe ni vos codes. Notre équipe ne vous écrira jamais en premier pour les demander.","لا نطلب كلمة المرور أو الرموز أبداً. لن يراسلك فريقنا أولاً لطلبها."],
["Change password","Changer le mot de passe","تغيير كلمة المرور"],["Invite friends","Inviter des amis","ادعُ أصدقاءك"],
["When a friend joins with your link and completes a first purchase, you both earn AstroCoins.","Quand un ami s’inscrit avec votre lien et fait un premier achat, vous gagnez tous les deux des AstroCoins.","عندما ينضم صديق عبر رابطك ويُكمل أول عملية شراء، تربحان معاً AstroCoins."],
["Two-step login","Connexion en deux étapes","تسجيل الدخول بخطوتين"],["Protect your account with a 6-digit code from an authenticator app. Required for staff.","Protégez votre compte avec un code à 6 chiffres d’une application d’authentification. Obligatoire pour l’équipe.","احمِ حسابك برمز من 6 أرقام من تطبيق المصادقة. مطلوب للموظفين."],
["Turn on","Activer","تفعيل"],["Turn off","Désactiver","إيقاف"],["Learn more","En savoir plus","اعرف المزيد"],["How it works","Comment ça marche","كيف يعمل"],["FAQ","FAQ","الأسئلة الشائعة"],["Refunds","Remboursements","الاسترداد"],
["Log out","Se déconnecter","تسجيل الخروج"],["Wallet · add money","Portefeuille · ajouter de l’argent","المحفظة · إضافة رصيد"],["Get help","Obtenir de l’aide","احصل على مساعدة"],
// help
["How can we help?","Comment pouvons-nous vous aider ?","كيف يمكننا مساعدتك؟"],["Pick a topic. A real person replies, usually within a few hours.","Choisissez un sujet. Une vraie personne vous répond, généralement en quelques heures.","اختر موضوعاً. يرد عليك شخص حقيقي عادةً خلال ساعات."],
["Order problem","Problème de commande","مشكلة في الطلب"],["Payment / top-up","Paiement / recharge","الدفع / الشحن"],["Refund request","Demande de remboursement","طلب استرداد"],["Password / login","Mot de passe / connexion","كلمة المرور / الدخول"],
["Account help","Aide pour le compte","مساعدة الحساب"],["Product not working","Produit qui ne fonctionne pas","المنتج لا يعمل"],["Something else","Autre chose","شيء آخر"],
["Which order, and what went wrong?","Quelle commande, et quel est le problème ?","أي طلب، وما المشكلة؟"],["Include the amount, the payment method and the transaction ID.","Indiquez le montant, le mode de paiement et l’identifiant de transaction.","اذكر المبلغ وطريقة الدفع ومعرّف العملية."],
["Which order, and why would you like a refund?","Quelle commande, et pourquoi souhaitez-vous un remboursement ?","أي طلب، ولماذا تريد الاسترداد؟"],["Tell us the email on your account. Never send your password.","Indiquez l’e-mail de votre compte. N’envoyez jamais votre mot de passe.","أخبرنا بالبريد الإلكتروني لحسابك. لا ترسل كلمة المرور أبداً."],
["What do you need help with?","De quoi avez-vous besoin ?","ما الذي تحتاج مساعدة بشأنه؟"],["Which product, and what happens when you use it?","Quel produit, et que se passe-t-il quand vous l’utilisez ?","أي منتج، وماذا يحدث عند استخدامه؟"],["Tell us what you need.","Dites-nous ce dont vous avez besoin.","أخبرنا بما تحتاجه."],
["Quick answers (FAQ)","Réponses rapides (FAQ)","إجابات سريعة (الأسئلة الشائعة)"],["My tickets","Mes demandes","طلباتي للدعم"],["No tickets yet.","Aucune demande pour le moment.","لا توجد طلبات دعم بعد."],
["Which order?","Quelle commande ?","أي طلب؟"],["Subject","Objet","الموضوع"],["Message","Message","الرسالة"],["Send","Envoyer","إرسال"],["Choose…","Choisir…","اختر…"],
["🔒 Never share your password or codes. We will never ask for them.","🔒 Ne partagez jamais votre mot de passe ni vos codes. Nous ne les demanderons jamais.","🔒 لا تشارك كلمة المرور أو الرموز أبداً. لن نطلبها منك."],
["Chat with us","Discutez avec nous","تحدّث معنا"],["Usual reply time: within a few hours","Délai de réponse habituel : quelques heures","وقت الرد المعتاد: خلال ساعات قليلة"],
["Open","Ouvert","مفتوح"],["Agent replied","Un agent a répondu","ردّ الوكيل"],["Resolved","Résolu","تم الحل"],["Closed","Fermé","مغلق"],["Waiting for an agent","En attente d’un agent","بانتظار وكيل دعم"],
["Write a message…  (Enter to send)","Écrivez un message…  (Entrée pour envoyer)","اكتب رسالة…  (Enter للإرسال)"],
// auth
["Sign up","Inscription","إنشاء حساب"],["Email","E-mail","البريد الإلكتروني"],["Password","Mot de passe","كلمة المرور"],["Email me a code","Recevoir un code par e-mail","أرسل لي رمزاً بالبريد"],["Forgot password?","Mot de passe oublié ?","نسيت كلمة المرور؟"],
["Username (3–20 letters/numbers)","Nom d’utilisateur (3–20 lettres/chiffres)","اسم المستخدم (3–20 حرفاً/رقماً)"],["Password (min 8)","Mot de passe (8 minimum)","كلمة المرور (8 على الأقل)"],["Confirm password","Confirmer le mot de passe","تأكيد كلمة المرور"],
["Send me a code","Envoyez-moi un code","أرسل لي رمزاً"],["Log in with a code","Connexion avec un code","الدخول برمز"],["Send code","Envoyer le code","إرسال الرمز"],["Back","Retour","رجوع"],["Enter your code","Saisissez votre code","أدخل الرمز"],
["Code","Code","الرمز"],["We sent a code to","Nous avons envoyé un code à","أرسلنا رمزاً إلى"],[". Type it below, or tap the button inside the email.",". Saisissez-le ci-dessous, ou touchez le bouton dans l’e-mail.",". اكتبه أدناه أو اضغط الزر داخل البريد."],
["Resend code","Renvoyer le code","إعادة إرسال الرمز"],["Reset password","Réinitialiser le mot de passe","إعادة تعيين كلمة المرور"],["Send reset link","Envoyer le lien","إرسال الرابط"],["New password","Nouveau mot de passe","كلمة مرور جديدة"],["Save","Enregistrer","حفظ"],
["Enter the 6-digit code from your authenticator app.","Saisissez le code à 6 chiffres de votre application d’authentification.","أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة."],
["I agree to the Terms and Refund policy (links in the page footer).","J’accepte les Conditions et la politique de remboursement (liens en bas de page).","أوافق على الشروط وسياسة الاسترداد (الروابط أسفل الصفحة)."],
["Working…","Veuillez patienter…","جارٍ العمل…"],["Network problem. Please try again.","Problème de réseau. Veuillez réessayer.","مشكلة في الشبكة. حاول مرة أخرى."],
["Wrong email or password. If you just signed up, confirm your email first.","E-mail ou mot de passe incorrect. Si vous venez de vous inscrire, confirmez d’abord votre e-mail.","البريد أو كلمة المرور غير صحيحة. إن سجّلت للتو فأكّد بريدك أولاً."],
["That code is wrong or expired. Tap “Resend code” for a new one.","Ce code est incorrect ou expiré. Touchez « Renvoyer le code » pour en recevoir un nouveau.","الرمز خاطئ أو منتهي. اضغط «إعادة إرسال الرمز» للحصول على رمز جديد."],
// footer + legal pages
["About","À propos","من نحن"],["Terms","Conditions","الشروط"],["Privacy","Confidentialité","الخصوصية"],
["How it works","Comment ça marche","كيف يعمل"],["Create a free account.","Créez un compte gratuit.","أنشئ حساباً مجانياً."],["Takes a minute. Confirm your email with a code.","Une minute suffit. Confirmez votre e-mail avec un code.","يستغرق دقيقة. أكّد بريدك برمز."],
["Add money to your wallet.","Ajoutez de l’argent à votre portefeuille.","أضف رصيداً إلى محفظتك."],["Tap your balance at the top, choose how to pay (crypto, Binance Pay, RedotPay, D17), and follow the steps. Some payments are credited automatically; others are checked by our team within hours. $1 = 1.00 in your wallet.","Touchez votre solde en haut, choisissez le mode de paiement (crypto, Binance Pay, RedotPay, D17) et suivez les étapes. Certains paiements sont crédités automatiquement ; d’autres sont vérifiés par notre équipe en quelques heures. 1 $ = 1,00 dans votre portefeuille.","اضغط على رصيدك في الأعلى واختر طريقة الدفع (عملات رقمية، Binance Pay، RedotPay، D17) واتبع الخطوات. بعض الدفعات تُضاف تلقائياً وأخرى يراجعها فريقنا خلال ساعات. 1$ = 1.00 في محفظتك."],
["Pick a product and tap Buy.","Choisissez un produit et appuyez sur Acheter.","اختر منتجاً واضغط شراء."],["You always see the price and your balance before and after. Nothing is charged until you confirm.","Vous voyez toujours le prix et votre solde avant et après. Rien n’est débité avant votre confirmation.","ترى دائماً السعر ورصيدك قبل الشراء وبعده. لا يُخصم شيء قبل تأكيدك."],
["Get it.","Recevez-le.","استلمه."],["Instant items appear in Orders right away. Others are prepared by our team and you get a notification when they’re ready.","Les articles instantanés apparaissent aussitôt dans Commandes. Les autres sont préparés par notre équipe et vous êtes notifié quand ils sont prêts.","المنتجات الفورية تظهر في الطلبات مباشرة. الأخرى يجهزها فريقنا ويصلك إشعار عند جاهزيتها."],
["Need anything?","Besoin d’aide ?","هل تحتاج شيئاً؟"],["Open the Help tab and chat with a real person. If we can’t deliver, you’re refunded to your wallet.","Ouvrez l’onglet Aide et discutez avec une vraie personne. Si nous ne pouvons pas livrer, vous êtes remboursé sur votre portefeuille.","افتح تبويب المساعدة وتحدّث مع شخص حقيقي. إن تعذّر التسليم تُسترد أموالك إلى محفظتك."],
["🔒 We will never ask for your password or codes. Never share them with anyone.","🔒 Nous ne demanderons jamais votre mot de passe ni vos codes. Ne les partagez avec personne.","🔒 لن نطلب كلمة المرور أو الرموز أبداً. لا تشاركها مع أحد."],["Got it","Compris","فهمت"],
["Refund policy","Politique de remboursement","سياسة الاسترداد"],["We cannot deliver:","Nous ne pouvons pas livrer :","تعذّر التسليم:"],["full refund to your wallet, automatically.","remboursement complet sur votre portefeuille, automatiquement.","استرداد كامل إلى محفظتك تلقائياً."],
["Item stops working during its warranty:","Article qui cesse de fonctionner pendant sa garantie :","توقف المنتج خلال فترة الضمان:"],["open a ticket from the order. We replace it or refund the order to your wallet.","ouvrez une demande depuis la commande. Nous le remplaçons ou remboursons la commande sur votre portefeuille.","افتح طلب دعم من صفحة الطلب. نستبدله أو نرد قيمة الطلب إلى محفظتك."],
["Delivered and working:","Livré et fonctionnel :","تم التسليم ويعمل:"],["not refundable.","non remboursable.","غير قابل للاسترداد."],["Wrong details you entered","Informations erronées saisies par vous","بيانات خاطئة أدخلتها"],
["(player ID, email): we cannot reverse a top-up sent to the wrong account, so please double-check.","(ID joueur, e-mail) : nous ne pouvons pas annuler une recharge envoyée au mauvais compte, vérifiez donc bien.","(معرّف اللاعب، البريد): لا يمكننا عكس شحن أُرسل إلى حساب خاطئ، لذا تأكد جيداً."],
["Payment problems:","Problèmes de paiement :","مشاكل الدفع:"],["if you paid but were not credited, open a ticket with your transaction ID and we will investigate.","si vous avez payé sans être crédité, ouvrez une demande avec votre identifiant de transaction et nous enquêterons.","إن دفعت ولم يُضف الرصيد، افتح طلب دعم مع معرّف العملية وسنتحقق."],
["How do I add money?","Comment ajouter de l’argent ?","كيف أضيف رصيداً؟"],["Wallet tab: choose a method, send the payment, then upload the screenshot with the transaction ID and your name. We verify and credit it.","Onglet Portefeuille : choisissez un mode, envoyez le paiement, puis téléversez la capture d’écran avec l’identifiant de transaction et votre nom. Nous vérifions et créditons.","تبويب المحفظة: اختر طريقة، أرسل الدفعة، ثم ارفع لقطة الشاشة مع معرّف العملية واسمك. نتحقق ونضيف الرصيد."],
["What are AstroCoins?","Que sont les AstroCoins ?","ما هي AstroCoins؟"],["Cashback points you earn on completed orders. Redeem them from the Wallet tab as wallet credit.","Des points de cashback gagnés sur les commandes terminées. Échangez-les depuis l’onglet Portefeuille contre du crédit.","نقاط استرداد نقدي تربحها من الطلبات المكتملة. استبدلها من تبويب المحفظة برصيد."],
["How long does verification take?","Combien de temps dure la vérification ?","كم تستغرق عملية التحقق؟"],["Usually within a few hours. You get a notification and an email as soon as it is done.","Généralement quelques heures. Vous recevez une notification et un e-mail dès que c’est fait.","عادةً خلال ساعات قليلة. يصلك إشعار وبريد إلكتروني فور الانتهاء."],
["Instant vs \"On request\"?","Instantané ou « Sur demande » ?","فوري أم «عند الطلب»؟"],["Instant items appear in Orders the moment you pay. \"On request\" items are handled by our team and show their status in Orders.","Les articles instantanés apparaissent dans Commandes dès le paiement. Les articles « Sur demande » sont traités par notre équipe et leur statut s’affiche dans Commandes.","المنتجات الفورية تظهر في الطلبات لحظة الدفع. منتجات «عند الطلب» يعالجها فريقنا وتظهر حالتها في الطلبات."],
["My item stopped working.","Mon article ne fonctionne plus.","توقف منتجي عن العمل."],["Open the order and press \"Need help with this order\". We will replace or refund it within the warranty.","Ouvrez la commande et appuyez sur « Besoin d’aide pour cette commande ». Nous le remplaçons ou remboursons dans le cadre de la garantie.","افتح الطلب واضغط «هل تحتاج مساعدة بخصوص هذا الطلب». نستبدله أو نرده ضمن الضمان."],
["Why do you need a screenshot?","Pourquoi une capture d’écran ?","لماذا تحتاجون لقطة شاشة؟"],["It protects you and us from fake payments, and it is only visible to the staff who verify it.","Elle nous protège des faux paiements et n’est visible que par l’équipe qui la vérifie.","تحمينا وتحميك من الدفعات المزيفة ولا يراها سوى الموظفين الذين يتحققون منها."],
["Is this official?","Est-ce officiel ?","هل هذا رسمي؟"],["No. We are an independent reseller and not affiliated with the brands we sell.","Non. Nous sommes un revendeur indépendant, non affilié aux marques vendues.","لا. نحن بائع مستقل وغير تابعين للعلامات التي نبيعها."]
];
const MAP=new Map(W.map(r=>[r[0],r[I]]));
// patterns for text with numbers / names inside. $1, $2 = captured parts
const R=(re,fr,ar)=>[re,[fr,ar]];
const RX=[
R(/^(\d+) sold$/,"$1 vendus","$1 مبيع"),R(/^(\d+) left$/,"$1 restants","$1 متبقي"),R(/^(\d+) available$/,"$1 disponibles","$1 متوفر"),
R(/^⚠️ Not in (.+)$/,"⚠️ Indisponible en $1","⚠️ غير متاح في $1"),R(/^Buy for (.+)$/,"Acheter pour $1","اشترِ بـ $1"),R(/^Add (.+) to buy$/,"Ajoutez $1 pour acheter","أضف $1 للشراء"),
R(/^Confirm purchase of (.+) for (.+)\?$/,"Confirmer l’achat de $1 pour $2 ?","تأكيد شراء $1 بـ $2؟"),R(/^🛡️ (\d+)-day warranty$/,"🛡️ Garantie $1 jours","🛡️ ضمان $1 يوماً"),R(/^🛡️ (\d+)-day replacement$/,"🛡️ Remplacement sous $1 jours","🛡️ استبدال خلال $1 يوماً"),
R(/^👍 (\d+)% · (\d+) reviews$/,"👍 $1 % · $2 avis","👍 $1% · $2 تقييم"),R(/^✅ (\d+) orders completed( · 👍 (\d+)% positive)?$/,"✅ $1 commandes terminées$2","✅ $1 طلب مكتمل$2"),
R(/^🪙 (\d+) AstroCoins$/,"🪙 $1 AstroCoins","🪙 $1 AstroCoins"),R(/^Earn (\d+) per \$1 you spend · (\d+) coins = \$1$/,"Gagnez $1 par 1 $ dépensé · $2 coins = 1 $","اربح $1 لكل 1$ تنفقه · $2 عملة = 1$"),
R(/^Redeem (\d+) → (.+)$/,"Échanger $1 → $2","استبدال $1 ← $2"),R(/^① How much\? \((.+)\)$/,"① Combien ? ($1)","① كم المبلغ؟ ($1)"),
R(/^🔒 Every payment is verified before it is added\. Manual proofs take (.+)\.$/,"🔒 Chaque paiement est vérifié avant d’être ajouté. Les preuves manuelles prennent $1.","🔒 يتم التحقق من كل دفعة قبل إضافتها. الإثباتات اليدوية تستغرق $1."),
R(/^🔒 For your security, (.+) payments need your full name and phone number\. One pending payment at a time, up to (.+) each\. New accounts start with smaller limits\.$/,"🔒 Pour votre sécurité, les paiements $1 nécessitent votre nom complet et votre numéro de téléphone. Un seul paiement en attente à la fois, jusqu’à $2 chacun. Les nouveaux comptes démarrent avec des limites plus basses.","🔒 لأمانك، تتطلب دفعات $1 اسمك الكامل ورقم هاتفك. دفعة واحدة قيد الانتظار فقط في كل مرة، حتى $2 لكل دفعة. الحسابات الجديدة لها حدود أقل."),
R(/^🔒 For your security, (.+) payments need your full name and phone number\. One pending payment at a time\. New accounts start with smaller limits\.$/,"🔒 Pour votre sécurité, les paiements $1 nécessitent votre nom complet et votre numéro de téléphone. Un seul paiement en attente à la fois. Les nouveaux comptes démarrent avec des limites plus basses.","🔒 لأمانك، تتطلب دفعات $1 اسمك الكامل ورقم هاتفك. دفعة واحدة قيد الانتظار فقط في كل مرة. الحسابات الجديدة لها حدود أقل."),
R(/^✅ Identity on file: (.+)$/,"✅ Identité enregistrée : $1","✅ الهوية محفوظة: $1"),R(/^⏳ (Ends|Ended) on (.+)$/,"⏳ $1 le $2","⏳ $1 في $2"),R(/^🛡️ Warranty (until|ended) (.+)$/,"🛡️ Garantie $1 $2","🛡️ الضمان $1 $2"),
R(/^Last updated (.+)\.$/,"Dernière mise à jour : $1.","آخر تحديث: $1."),R(/^About (.+)$/,"À propos de $1","عن $1"),R(/^Usual reply time: (.+)$/,"Délai de réponse habituel : $1","وقت الرد المعتاد: $1"),
R(/^Verify that this number is yours: (.+)$/,"Vérifiez que ce numéro est bien le vôtre : $1","تأكد أن هذا الرقم يخصك: $1"),R(/^Your review: (.+)$/,"Votre avis : $1","تقييمك: $1")
];
function tr(s){
 if(MAP.has(s))return MAP.get(s);
 for(const[re,t]of RX){const m=re.exec(s);if(m)return t[I-1].replace(/\$(\d)/g,(_,k)=>m[k]||"")}
 const m=/^([^A-Za-z0-9\u0600-\u06FF]+)(.+)$/.exec(s);if(m&&MAP.has(m[2]))return m[1]+MAP.get(m[2]);   // keep a leading emoji
 return null}
const SKIP={SCRIPT:1,STYLE:1,TEXTAREA:1,CODE:1};
function node(n){
 if(n.nodeType===3){const raw=n.nodeValue,s=raw.trim();if(!s||n.__t===raw)return;const t=tr(s);if(t&&t!==s){const out=raw.replace(s,t);n.__t=out;n.nodeValue=out}}
 else if(n.nodeType===1){if(SKIP[n.tagName]||n.closest&&n.closest("[data-nt]"))return;
  for(const a of["placeholder","title","aria-label","alt"]){const v=n.getAttribute&&n.getAttribute(a);if(v){const t=tr(v.trim());if(t&&t!==v)n.setAttribute(a,t)}}
  n.childNodes.forEach(node)}}
let q=false;const pend=new Set();
new MutationObserver(ms=>{for(const m of ms){if(m.type==="characterData")pend.add(m.target);else m.addedNodes.forEach(x=>pend.add(x))}
 if(!q){q=true;requestAnimationFrame(()=>{q=false;pend.forEach(node);pend.clear()})}}).observe(document.body,{childList:true,subtree:true,characterData:true});
node(document.body);
})();
