/*
 * ─── עברית · Русский, בתוכנה שעל המחשב ───────────────────────────────────
 *
 * "תוסיף אופציה גם לרוסית באפליקציה גם בחיבור וגם בתוכנה עצמה."
 *
 * A SEPARATE FILE, NOT AN INLINE SCRIPT, because index.html carries
 * `script-src 'self'` and an inline block would simply not run. Loaded before
 * app.js so the first paint is already in the chosen language.
 *
 * KEYED BY THE HEBREW SENTENCE, the same decision the website's dictionary
 * makes: a sentence with no Russian renders in Hebrew instead of rendering a
 * key or an empty gap, so this window is never broken by a gap in coverage.
 *
 * EACH NODE REMEMBERS ITS OWN HEBREW. Translating in place and then
 * translating back would mean looking the Russian up in reverse, and two
 * Hebrew sentences can share one Russian. So the original is stored on the
 * node the first time it is seen, and every switch renders FROM that.
 *
 * AND IT WATCHES, because app.js writes into this window while it runs —
 * statuses, counts, the activity log. A one-shot pass would translate the
 * window as it opened and then let Hebrew leak back in line by line.
 */
(function () {
  'use strict';

  var KEY = 'anx.worker.lang';

  var RU = {
    '· בדיקה אוטומטית כבויה בהגדרות': '· автоматическая проверка отключена в настройках',
    '· נבדק שוב לבד כל כמה שעות': '· проверяется само каждые несколько часов',
    'אין כאן כלום': 'Здесь ничего нет',
    'אין משימה קרובה': 'Ближайших задач нет',
    'אין משימות בתור': 'Задач в очереди нет',
    'אין עדיין': 'Пока нет',
    'בהיר או כהה — נשמר למחשב הזה': 'Светлая или тёмная — сохраняется для этого ПК',
    'בודק אם יש גרסה חדשה…': 'Проверяем, есть ли новая версия…',
    'בונים סבב חדש בדשבורד באתר.': 'Новый цикл создают в панели управления на сайте.',
    'בוקר טוב': 'Доброе утро',
    'בלי לפתוח חלון בכל הדלקה': 'Без открытия окна при каждом включении',
    'במקום לסגור לגמרי': 'Вместо полного закрытия',
    'ברגע שיצא פרסום הוא יופיע כאן.': 'Как только выйдет публикация, она появится здесь.',
    'דולג': 'Пропущено',
    'דורש אתכם': 'Ждёт вас',
    'הגרסה החדשה מוכנה להתקנה': 'Новая версия готова к установке',
    'הגרסה שלכם מעודכנת': 'У вас последняя версия',
    'הודעה כשמשהו דורש אתכם': 'Уведомление, когда что-то ждёт вас',
    'היומן ריק': 'Журнал пуст',
    'הכול רץ לבד': 'Всё работает само',
    'המשך לעבוד ברקע': 'Продолжать работу в фоне',
    'הסתיים': 'Завершено',
    'הפעל עם Windows': 'Запускать вместе с Windows',
    'הפעלה במצב ממוזער': 'Запуск в свёрнутом виде',
    'הצליח': 'Удалось',
    'הקוד נשלח אליכם מפייסבוק — בהודעה, במייל או באפליקציה. הקלידו אותו כאן.': 'Код отправлен вам из Facebook — в сообщении, на почту или в приложении. Введите его здесь.',
    'התוכנה תעלה לבד אחרי הדלקה של המחשב': 'Программа поднимется сама после включения ПК',
    'התקנה של גרסה חדשה בלי לשאול': 'Установка новой версии без вопросов',
    'התראות': 'Уведомления',
    'ידני': 'Вручную',
    'יצאה גרסה חדשה': 'Вышла новая версия',
    'כל פעולה שהמנוע יעשה תירשם כאן.': 'Каждое действие движка будет записано здесь.',
    'לא הצלחנו לבדוק': 'Проверить не удалось',
    'לא ימשיכו בלי אישור': 'Не продолжат без подтверждения',
    'מוריד את הגרסה החדשה': 'Скачиваем новую версию',
    'מוריד…': 'Скачиваем…',
    'מושהה': 'На паузе',
    'מזער לסמל ליד השעון': 'Свернуть в значок рядом с часами',
    'מחובר': 'Подключён',
    'מידע': 'Информация',
    'ממתין': 'Ждёт',
    'ממתין לאישור': 'Ждёт одобрения',
    'מנתק…': 'Отключаем…',
    'מערכת': 'Система',
    'מפרסם עכשיו': 'Публикуем сейчас',
    'מצב כהה': 'Тёмная тема',
    'מתחבר…': 'Подключаемся…',
    'מתקין…': 'Устанавливаем…',
    'נכשל': 'Сбой',
    'נסו לשונית אחרת, או בנו סבב חדש בדשבורד.': 'Попробуйте другую вкладку или создайте новый цикл в панели управления.',
    'נעצר': 'Стоп',
    'נפתח חלון בדפדפן. אפשר לחזור לכאן אחרי ההתחברות.': 'Открылось окно в браузере. Можно вернуться сюда после входа.',
    'סגירת החלון לא עוצרת את הפרסום': 'Закрытие окна не останавливает публикацию',
    'עדיין לא יצא פרסום היום': 'Сегодня публикация ещё не выходила',
    'עדכונים אוטומטיים': 'Автоматические обновления',
    'עדכונים אוטומטיים לא פעילים כאן': 'Автоматические обновления здесь не активны',
    'עוד לא נבדק': 'Ещё не проверено',
    'עוד לא קרה כלום': 'Пока ничего не произошло',
    /* ago() prints these four whole, because a count of one or two is a
       word in Hebrew and not a number — see app.js. The web app answers the
       same four the same way (src/lib/social/i18n.ts). */
    'לפני דקה': '1 мин',
    'לפני יום': 'день назад',
    'לפני יומיים': 'два дня назад',
    'לפני שעה': '1 ч',
    'עכשיו': 'Сейчас',
    'ערב טוב': 'Добрый вечер',
    'פותח…': 'Открываем…',
    'פייסבוק ביקש קוד אימות': 'Facebook запросил код подтверждения',
    'פעולה': 'Действие',
    'פעיל': 'Активно',
    'פרסום לקבוצה': 'Публикация в группу',
    'פרסום מתוזמן': 'Запланированная публикация',
    'פרסומים יצאו היום': 'Публикаций вышло сегодня',
    'צהריים טובים': 'Добрый день',
    'קודם המייל, ואז נשלח אליו קוד.': 'Сначала почта, а затем мы отправим на неё код.',
    'שלחנו קוד למייל. אם הוא לא מגיע תוך דקה — בדקו בספאם.': 'Мы отправили код на почту. Если он не приходит в течение минуты — проверьте спам.',
    'תקלה': 'Сбой',
    'הפרסום שלכם ממשיך': 'Ваши публикации продолжаются',
    'גם כשאתם לא ליד המחשב.': 'даже когда вас нет за ПК.',
    'ANX Worker מפרסם לקבוצות פייסבוק לפי התזמון שקבעתם, מהמחשב שלכם, עם החשבון שלכם.':
      'ANX Worker публикует в группы Facebook по заданному вами расписанию, с вашего компьютера и под вашим аккаунтом.',
    'פרסום מתוזמן לכל הקבוצות': 'Публикации по расписанию во все группы',
    'תגובות אוטומטיות עם תמונה': 'Автоматические комментарии с картинкой',
    'מעקב מלא מהטלפון': 'Полный контроль с телефона',
    'ברוכים הבאים': 'Добро пожаловать',
    'התחברו לחשבון שלכם כדי להפעיל את ה־Worker': 'Войдите в свой аккаунт, чтобы запустить Worker',
    'זכור אותי': 'Запомнить меня',
    'התחבר': 'Войти',
    'או': 'или',
    'אין לך חשבון?': 'Нет аккаунта?',
    'צור חשבון חדש': 'Создать аккаунт',
    'להתחבר בלי סיסמה — קוד למייל': 'Войти без пароля — код на почту',
    'אישור הקוד': 'Подтверждение кода',
    'בית': 'Главная',
    'משימות': 'Задачи',
    'יומן פעילות': 'Журнал активности',
    'הגדרות': 'Настройки',
    'עדכונים': 'Обновления',
    'עזרה': 'Помощь',
    'גרסה': 'Версия',
    'יומן טכני': 'Технический журнал',
    'מתחיל…': 'Запускаем…',
    'הפעלה': 'Запуск',
    'הדשבורד באתר': 'Панель управления на сайте',
    'שלום': 'Здравствуйте',
    'זה מה שקרה במחשב הזה.': 'Вот что происходило на этом ПК.',
    'תצוגה מוקטנת': 'Компактный вид',
    'חברו את חשבון הפייסבוק שלכם': 'Подключите свой аккаунт Facebook',
    'פתח את פייסבוק': 'Открыть Facebook',
    'שלח': 'Отправить',
    'משימות בתור': 'Задачи в очереди',
    'ממתינות לביצוע': 'Ожидают выполнения',
    'בוצעו היום': 'Выполнено сегодня',
    'מאז חצות': 'С полуночи',
    'המשימה האחרונה': 'Последняя задача',
    'דורשות אתכם': 'Требуют вашего участия',
    'לא ימשיכו לבד': 'Сами не продолжатся',
    'פעילות אחרונה': 'Последняя активность',
    'הכל': 'Всё',
    'הקרובות בתור': 'Ближайшие в очереди',
    'הוסף משימה': 'Добавить задачу',
    'כל מה שקרה, לפי הסדר.': 'Всё, что произошло, по порядку.',
    'ההגדרות האלה שייכות למחשב הזה בלבד.': 'Эти настройки относятся только к этому ПК.',
    'החשבון': 'Аккаунт',
    'המחשב הזה מחובר לחשבון הזה': 'Этот ПК подключён к этому аккаунту',
    'נתק את המחשב': 'Отключить ПК',
    'לא מחובר': 'Не подключён',
    'חשבון הפייסבוק שממנו יוצאים הפרסומים': 'Аккаунт Facebook, с которого выходят публикации',
    'בדוק חיבור': 'Проверить подключение',
    'נתק פייסבוק': 'Отключить Facebook',
    'התוכנה בודקת בעצמה אם יצאה גרסה חדשה, ומורידה אותה ברקע.':
      'Программа сама проверяет, вышла ли новая версия, и скачивает её в фоне.',
    'בודק…': 'Проверяем…',
    'גרסה מותקנת': 'Установленная версия',
    'התקן עכשיו והפעל מחדש': 'Установить сейчас и перезапустить',
    'הורד את הגרסה החדשה': 'Скачать новую версию',
    'בדוק אם יש עדכון': 'Проверить обновления',
    'מה חדש': 'Что нового',
    'מתי זה יתקין את עצמו?': 'Когда она установится сама?',
    'הפרסום ייעצר בזמן ההתקנה?': 'Остановится ли публикация во время установки?',
    'אפשר לבטל את ההורדה האוטומטית?': 'Можно ли отключить автоматическую загрузку?',
    'שלושת הדברים שנשאלים הכי הרבה.': 'Три самых частых вопроса.',
    'החלון נסגר — הפרסום נעצר?': 'Окно закрыто — публикация остановилась?',
    'צריך שהמחשב יהיה דלוק?': 'Компьютер должен быть включён?',
    'כן. הפרסום יוצא מהדפדפן שעל המחשב הזה, אז בזמן שמשימה אמורה לצאת המחשב צריך להיות פועל.':
      'Да. Публикация идёт из браузера на этом компьютере, поэтому в момент выхода задачи он должен быть включён.',
    'איפה בונים פוסטים?': 'Где создаются посты?',
    'בדשבורד באתר — שם בונים תוכן, קבוצות וסבבים. החלון הזה רק מבצע.':
      'В панели управления на сайте — там создаются контент, группы и циклы. Это окно только выполняет.',
    'מה שהמנוע כותב. לא נדרש לשימוש רגיל.': 'То, что пишет движок. Для обычной работы не требуется.',
    'האימייל שפתחתם בו את החשבון': 'Эл. почта, на которую зарегистрирован аккаунт',
    'סיסמה': 'Пароль',
    'הצג סיסמה': 'Показать пароль',
    'הקוד מהמייל, או הדביקו את הקישור': 'Код из письма или вставьте ссылку',
    'כיבוי משהה את הפרסום עד שמדליקים חזרה': 'Выключение приостанавливает публикацию до повторного включения',
    'הפעלה או השהיה של הפרסום': 'Запуск или приостановка публикации',
    'הקוד שפייסבוק שלח': 'Код, который прислал Facebook',
    'סגור': 'Закрыть',
    'התחברות עם Google': 'Войти через Google',
    'ייפתח חלון Chrome על הדף של פייסבוק עצמו. הסיסמה נשארת אצלכם — אנחנו לא רואים אותה ולא שומרים אותה.':
      'Откроется окно Chrome на самой странице Facebook. Пароль остаётся у вас — мы его не видим и не храним.',
    'אף פעם באמצע עבודה. גרסה חדשה יורדת ברקע ומחכה — היא נכנסת לפעולה בפעם הבאה שסוגרים את התוכנה לגמרי, או ברגע שלוחצים כאן על "התקן עכשיו".':
      'Никогда посреди работы. Новая версия скачивается в фоне и ждёт — она вступает в силу при следующем полном закрытии программы или сразу после нажатия здесь «Установить сейчас».',
    'להתקנה עצמה לוקח כמה שניות, והתוכנה חוזרת לבד וממשיכה מאיפה שהפסיקה. מה שמתוזמן לשעה אחרת לא מושפע.':
      'Сама установка занимает несколько секунд, программа возвращается сама и продолжает с того места, где остановилась. На задачи, назначенные на другое время, это не влияет.',
    'כן — בהגדרות, "עדכונים אוטומטיים". כשהיא כבויה המסך הזה עדיין יגיד לכם שיצאה גרסה, פשוט לא יוריד אותה עד שתבקשו.':
      'Да — в настройках, «Автоматические обновления». Когда они выключены, этот экран всё равно сообщит о новой версии, просто не скачает её, пока вы не попросите.',
    'לא. סגירה מסתירה את החלון בלבד; הסמל נשאר ליד השעון והפרסום ממשיך. יציאה אמיתית היא מהתפריט של הסמל.':
      'Нет. Закрытие лишь скрывает окно; значок остаётся рядом с часами, и публикация продолжается. Настоящий выход — из меню значка.',
    'שפה': 'Язык',
    'בחירת שפה': 'Выбор языка',
  };

  /*
   * ─── THE LINES app.js BUILDS AROUND A VALUE ────────────────────────────
   *
   * A dictionary of whole sentences answers what index.html carries, and
   * cannot answer what app.js writes while it runs:
   *
   *     `לפני ${m} דק׳`      `מתוזמן ל־${when(t.scheduledAt)}`
   *
   * On screen each of those is one text node with a number or a time inside
   * it, and no fixed key will ever equal it. § marks where the value goes,
   * and the Russian puts its own § where Russian needs it. Matched anchored
   * at both ends, so a pattern describes a whole line and cannot swallow a
   * longer one that merely contains it.
   */
  var RU_PAT = {
    '§ משימות': '§ задач',
    'הבאה ב־§': 'Следующая в §',
    'לא הצלחנו לקרוא: §': 'Прочитать не удалось: §',
    'לפני § דק׳': '§ мин',
    'לפני § ימים': '§ {день|дня|дней} назад',
    'לפני § שע׳': '§ ч',
    'מתוזמן ל־§': 'Запланировано на §',
    'נבדק לאחרונה §§': 'Последняя проверка §§',
    'פורסם §': 'Вышло §',
    /* ── filled in below ── */
  };

  var ATTRS = ['placeholder', 'aria-label', 'title'];
  var lang = 'he';
  var compiled = null;

  function compilePatterns() {
    if (compiled) return compiled;
    var rows = [];
    for (var he in RU_PAT) {
      if (!Object.prototype.hasOwnProperty.call(RU_PAT, he)) continue;
      rows.push([he, RU_PAT[he]]);
    }
    /* Longest literal text first, so the most specific shape wins. */
    rows.sort(function (a, b) {
      return b[0].split('\u00a7').join('').length - a[0].split('\u00a7').join('').length;
    });
    compiled = rows.map(function (row) {
      var parts = row[0].split('\u00a7').map(function (part) {
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      });
      return { re: new RegExp('^' + parts.join('([\\s\\S]*?)') + '$'), out: row[1] };
    });
    return compiled;
  }

  /*
   * ─── A NUMBER CHANGES THE NOUN IN RUSSIAN ──────────────────────────────
   *
   * Hebrew has one plural and Russian has three, chosen by the last digits
   * of the number in front of the noun. A shape with one fixed form is wrong
   * two thirds of the time — this window said "1 дней назад" and "2 дней
   * назад" — and it is not a missing translation, which is why no coverage
   * check would ever see it. The same {one|few|many} notation the web app
   * uses (src/lib/social/i18n.ts), so the two dictionaries read alike.
   */
  var PLURAL = /\{([^{}|]*)\|([^{}|]*)\|([^{}|]*)\}/g;

  function pickForm(a, b, c, value) {
    var n = Math.abs(Number(String(value).replace(/[\s,\u00a0]/g, '')));
    if (!isFinite(n) || Math.floor(n) !== n) return c;
    var hundred = n % 100;
    if (hundred >= 11 && hundred <= 14) return c;
    var ten = n % 10;
    if (ten === 1) return a;
    if (ten >= 2 && ten <= 4) return b;
    return c;
  }

  /* Every braced noun in one piece of the Russian, settled against the value
     that stands in front of it. */
  function settle(text, value) {
    return text.replace(PLURAL, function (_m, a, b, c) {
      return pickForm(a, b, c, value);
    });
  }

  function fill(out, values) {
    var parts = out.split('\u00a7');
    /* Before the first value there is nothing to agree with, so a noun there
       takes the third form rather than guessing. */
    var text = settle(parts[0], '');
    for (var i = 1; i < parts.length; i += 1) {
      var v = values[i - 1] === undefined ? '' : values[i - 1];
      text += v + settle(parts[i], v);
    }
    return text;
  }

  function matchPattern(hebrew) {
    var rows = compilePatterns();
    for (var i = 0; i < rows.length; i += 1) {
      var m = rows[i].re.exec(hebrew);
      if (!m) continue;
      return fill(rows[i].out, m.slice(1));
    }
    return null;
  }

  /** True when this window can say the line in Russian at all. */
  function known(hebrew) {
    return Object.prototype.hasOwnProperty.call(RU, hebrew) || matchPattern(hebrew) !== null;
  }

  function look(hebrew) {
    if (lang === 'he') return hebrew;
    var hit = RU[hebrew];
    if (hit !== undefined) return hit;
    var byPattern = matchPattern(hebrew);
    return byPattern === null ? hebrew : byPattern;
  }

  /* The sentence as it was authored, with the whitespace HTML collapses. */
  function tidy(s) {
    return String(s).replace(/\s+/g, ' ').trim();
  }

  /*
   * ─── app.js REWRITES THIS WINDOW WHILE IT RUNS ─────────────────────────
   *
   * Remembering a node's Hebrew once was right while the dictionary only
   * held fixed sentences: those never change. The patterns end that. The
   * line `לפני 7 דק׳` becomes `לפני 8 דק׳` a minute later, and a cache
   * would keep painting 7 over app.js's 8 for as long as the window stayed
   * open — a stale number is worse than an untranslated one.
   *
   * So the node remembers both sides: the Hebrew it was read from, and what
   * was written out. A value equal to what we wrote is our own paint and the
   * cache stands; anything else is app.js writing a new line, and the Hebrew
   * is read again from it.
   *
   * THE WHITESPACE IS KEPT, because a line app.js builds is often written
   * next to a number in its own node, and the space between them is the only
   * thing stopping the two from running together.
   */
  function paintNode(node) {
    var current = node.nodeValue === null ? '' : node.nodeValue;
    /* __anxSrc is what this node was last READ from and __anxOut what was
       last WRITTEN to it. Without the first, a node holding a bare number
       would be looked up again on every repaint for as long as the program
       stayed open. With it, an unchanged node costs one compare. */
    if (node.__anxHe === undefined || (current !== node.__anxSrc && current !== node.__anxOut)) {
      node.__anxSrc = current;
      var original = tidy(current);
      if (!original) {
        node.__anxHe = null;
        return;
      }
      node.__anxPre = /^\s*/.exec(current)[0];
      node.__anxPost = /\s*$/.exec(current)[0];
      /* Only lines this window can actually say in Russian are remembered,
         so a bare number or a name is never stored and never fought over. */
      node.__anxHe = known(original) ? original : null;
    }
    if (!node.__anxHe) return;
    var want = (node.__anxPre || '') + look(node.__anxHe) + (node.__anxPost || '');
    if (node.nodeValue !== want) node.nodeValue = want;
    node.__anxOut = want;
  }

  function paintAttrs(el) {
    for (var i = 0; i < ATTRS.length; i += 1) {
      var name = ATTRS[i];
      if (!el.hasAttribute || !el.hasAttribute(name)) continue;
      var store = '__anxAttr_' + name;
      var out = '__anxOut_' + name;
      var current = el.getAttribute(name) || '';
      if (el[store] === undefined || el[out] === undefined || current !== el[out]) {
        var original = tidy(current);
        el[store] = original && known(original) ? original : null;
      }
      if (!el[store]) continue;
      var want = look(el[store]);
      if (el.getAttribute(name) !== want) el.setAttribute(name, want);
      el[out] = want;
    }
  }

  function paint(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      paintNode(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    var node = walker.currentNode;
    while (node) {
      if (node.nodeType === 3) {
        var tag = node.parentNode && node.parentNode.nodeName;
        if (tag !== 'SCRIPT' && tag !== 'STYLE') paintNode(node);
      } else if (node.nodeType === 1) {
        paintAttrs(node);
      }
      node = walker.nextNode();
    }
  }

  function apply(next) {
    lang = next === 'ru' ? 'ru' : 'he';
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', lang === 'ru' ? 'ltr' : 'rtl');
    paint(document.body);
    var buttons = document.querySelectorAll('[data-lang]');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].setAttribute('aria-pressed', buttons[i].getAttribute('data-lang') === lang ? 'true' : 'false');
    }
  }

  function choose(next) {
    try {
      window.localStorage.setItem(KEY, next);
    } catch (e) {
      /* a profile with storage disabled still gets the switch for this run */
    }
    apply(next);
  }

  function boot() {
    var saved = null;
    try {
      saved = window.localStorage.getItem(KEY);
    } catch (e) {
      saved = null;
    }
    apply(saved === 'ru' ? 'ru' : 'he');

    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-lang]') : null;
      if (!el) return;
      e.preventDefault();
      choose(el.getAttribute('data-lang'));
    });

    /* app.js keeps writing into this window after it opens. */
    if (typeof MutationObserver === 'function') {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i += 1) {
          var r = records[i];
          if (r.type === 'characterData') paintNode(r.target);
          else if (r.type === 'attributes') paintAttrs(r.target);
          else for (var j = 0; j < r.addedNodes.length; j += 1) paint(r.addedNodes[j]);
        }
      }).observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ATTRS,
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* app.js may want to translate a string it is about to write. */
  window.anxT = look;
})();
