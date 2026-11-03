---
target: adminPage
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:F:\\Projects\\COntech\\ContechDC\\src\\pages\\SuperAdminPanel.jsx"
target_fingerprint: "sha256:0fba2166f41fb52cd8036e1a14999cc006efabd1e28aac272156eb7d08fee0c5"
target_path: "F:\\Projects\\COntech\\ContechDC\\src\\pages\\SuperAdminPanel.jsx"
timestamp: 2026-11-03T10-23-01Z
slug: src-pages-superadminpanel-jsx
---
## تقييم تصميم صفحة الإدارة

### Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3/4 | حالة النظام بارزة أكثر من العمل المطلوب من المدير. |
| 2 | Match system / real world | 3/4 | المصطلحات الأساسية مناسبة، لكن Data Setup تجمع مفاهيم متعددة. |
| 3 | User control and freedom | 3/4 | المسارات والفلاتر جيدة، لكن تأكيدات المتصفح محدودة السياق. |
| 4 | Consistency and standards | 2/4 | غلاف Navy/Cyan متماسك لكن محتوى التبويبات يتفاوت في الألوان والرموز. |
| 5 | Error prevention | 2/4 | حماية الدور جيدة، أما Reset/Delete فتحتاج حوارات منظمة. |
| 6 | Recognition rather than recall | 3/4 | التنقل واضح، وData Setup يتطلب معرفة سابقة. |
| 7 | Flexibility and efficiency | 3/4 | روابط وفلاتر جيدة، دون اختصارات أو عمليات مجمعة للحسابات. |
| 8 | Aesthetic and minimalist design | 2/4 | مؤشرات كثيرة متساوية الوزن ولا توجد قائمة أولويات. |
| 9 | Error recovery | 2/4 | بعض التوست لا يُعلن لقارئات الشاشة. |
| 10 | Help and documentation | 2/4 | لا توجد مساعدة سياقية كافية لإعدادات البيانات. |
| **Total** | | **25/40** | **Acceptable** |

### Design-specificity verdict

الغلاف الإداري يعبّر عن Contech بوضوح: Navy/Cyan، هوية Control Center، مصطلحات المشاريع والتحكم بالمستندات، وروابط قابلة للمشاركة عبر hash. أما القلب الداخلي فهو أقرب إلى لوحة إدارة عامة: بطاقات ملونة كثيرة، عناوين emoji، ومؤشرات نظام متساوية الوزن لا تجيب عن سؤال المدير الأهم: ما الذي يحتاج إجراءً الآن؟

### ما يعمل جيداً

1. حدود الدور والهوية واضحة في الغلاف الإداري واسم المستخدم وحالة الاتصال.
2. إنشاء المستخدم يبدأ بالدور ثم يعرض إعداداته المتخصصة تدريجياً.
3. لا يوجد تجاوز أفقي للصفحة عند 390px؛ الجدول وحده يمرر أفقياً بشكل مقصود.
4. كاشف Impeccable كان نظيفاً في الصفحة ومكوّنات التبويبات الخمسة.

### الأولويات

1. **[P1] نماذج الإدارة لا تملك تسميات برمجية موثوقة.** حقول Users وحقول Data/Projects تظهر لقارئ الشاشة كـ text field عامة لأن `label` لا يرتبط بـ`id` في `UsersManagementTab.jsx:367-436,529-561` ومناطق مماثلة في `DataManagementTab.jsx` و`ProjectsManagementTab.jsx`. أضف `id` و`htmlFor` أو labels متداخلة، وتسميات سياقية للحقول الديناميكية.
2. **[P1] رسائل الحالة ليست موحدة في الوصول.** Toast الغلاف ممتاز، لكن توست Users/Projects/Data/DC لا يملك `role` أو `aria-live` (`UsersManagementTab.jsx:317-325`, `ProjectsManagementTab.jsx:297-304`, `DataManagementTab.jsx:805-814`, `DCModeTab.jsx:1344-1357`). استخدم primitive موحداً يعلن النجاح والمعلومات والأخطاء.
3. **[P1] حوارا DC لتحديث الرقم والتفاصيل ليسا حوارات وصول حقيقية.** `DCModeTab.jsx:1663-1750` لا يطبّق semantics/focus trap/focus restore المعمول بها في حوار المراجع. استخرج dialog موحداً مع Escape وعنوان وزر إغلاق مسمى.
4. **[P1] Dashboard لا يقدّم قائمة عمل ذات أولوية.** البطاقات والمؤشرات تسبق مسار الإجراء؛ أضف "Needs attention" تحت العنوان للحالات المتأخرة أو الفاشلة قبل الإحصاءات (`DashboardTab.jsx:210-230,261-271,346-360`).
5. **[P2] Data Setup يصنف الأدوات ولا يوجّه المهمة.** خمس أدوات متساوية: Locations, Checklists, Descriptions, Subjects, Drawings. اجمعها بحسب النتيجة المطلوبة وأضف شرحاً قصيراً وتوصية أول خطوة.
6. **[P2] عمليات الصف في DC صغيرة وغامضة على الهاتف.** أسماء الأزرار تعتمد emoji، والمقاسات 27–37 × 38px (`DCModeTab.jsx:1227-1300`). استخدم `aria-label` سياقياً، وارفع hit area أو ضع العمليات الثانوية والمدمرة في overflow.
7. **[P2] Dashboard ينفذ ستة طلبات كل 30 ثانية.** `DashboardTab.jsx:37-60` يحتاج endpoint إجمالياً، إيقافاً أثناء hidden state، ومنع refresh المتداخل.

### Persona red flags

- **Alex:** لا يوجد bulk action أو اختصار أو قائمة عمل؛ إدارة الحسابات المتكررة صفاً بصف.
- **Sam:** حقول الإنشاء بلا accessible names، وبعض أزرار DC يعلنها القارئ كـemoji فقط.
- **Jordan:** Data Setup تطلب ترجمة خمسة مصطلحات داخلية قبل أن يعرف المستخدم أين يبدأ.

### ملاحظات ثانوية

- live region على التبويب كامل في `SuperAdminPanel.jsx:189-191` قد يعلن محتوى كبيراً؛ اجعله مقتصراً على رسائل الحالة القصيرة.
- "SQLite connected" مفيد للتشخيص لكنه ينافس المهام الأساسية في الهيدر.
- تنقل الجدول على الهاتف صحيح، لكن menu للعمليات الصفية سيكون أسهل من ثلاثة أزرار متجاورة.

### أسئلة للتفكير

- ما الاستثناءات التي يجب أن يراها مدير المستندات قبل أي عداد؟
- هل تريد أن تبقى Data Setup مساحة خبراء، أم أن تقود مديراً جديداً بحسب المهمة؟
- هل يجب أن تكون العمليات الحساسة (Reset/Delete/Archive) متسقة في حوار واحد قابل للمراجعة؟
