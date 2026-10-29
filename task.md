# AURA — Ajanların kullanacağı eylem katmanı

Tarih: 29 Ekim 2026. Araştırma ve kod değerlendirmesi sınırı: 28 Ekim 2026.
Durum: Tasarım ve uygulama görevleri. Bu çalışma kapsamında ürün kodu değiştirilmedi. Aşağıdaki kutular gelecekte yapılacak işi gösterir.
Kod tabanı: `osmandkitay/aura`, `aura-core-v2`, `ba534d1983a2ee3b90c687bef7474393c6c3d589`.

## 1. Vizyon ve elde edilecek sonuç

Web, ajanlara yalnızca okunacak sayfalar değil, yapılabilecek eylemleri de sunabilmeli. Bir ajan niyet belirlemek ve plan kurmak için çalışmalı; aynı HTTP ayrıntılarını tekrar çözmek, büyük yanıtların içinden değer kopyalamak ve bilinen bir iş akışını tekrar tekrar yorumlamak zorunda kalmamalı.

**AURA'nın görevi, web eylemlerini önceden hazırlanmış, kendi kendine yeten ve birbirine bağlanabilen açık sözleşmelere dönüştürmek. Ajan planı seçer; küçük bir yürütücü, bu plandaki HTTP çağrılarını ve veri aktarımını deterministik olarak yapar.**

Üretim hattı `derive → publish` olarak kalır. Beyan ve kaynak girdisi derlenir; küçük bir keşif indeksi ve tek tek alınabilen eylem dosyaları çıkar. Tüketici, kaynak OpenAPI'yi edinmeden ve kaynak şema grafını çözmeden bunları kullanabilir.

Yayılım yalnızca hedef sitenin AURA kurmasına bağlı değildir. Site sahibi kendi eylemlerini yayımlayabilir. Bir insanın ajanı da mevcut araçlarıyla öğrendiği mekanik çağrı tarifini beyan haline getirebilir; Git veya statik bir adreste yayımlayabilir; başka bir ajan aynı tarifi kullanabilir. Bu ikinci yol hedef sitenin sunucusuna dosya yazmayı gerektirmez. Tarifin yayıncısı, hedef API ve tarifin kaynağı birbirinden ayrılır.

Derleyici, beyanı insanın mı yoksa ajanın mı hazırladığına göre davranış değiştirmez. Eksik bilgiyi tahmin ederek tamamlamaz. Kaynağı ve sürümü belli, yeterince açık bir tarif ister. Tarif üretmek, keşfetmek ve deneyimlerden güncellemek bu sözleşmenin etrafında gelişebilir; bunların tamamını core içinde bir ajan platformu olarak inşa etmek bu işin kapsamı değildir.

Başarı ölçütü: desteklenen bir API ve hazırlanmış bir beyanla, genel bir AURA tüketicisi siteye özel yürütme kodu yazmadan giriş → oluşturma → yayımlama zincirini çalıştırır. Başarılı zincirde ara sonuçları taşımak için LLM çağrısı yapılmaz.

## 2. Vizyonun teknik olarak dürüst sınırları

| İfade | Bu işte kullanılacak kesin anlam |
| --- | --- |
| Yükü derleme zamanına taşı | Referans çözümü, desteklenen şema dönüşümü, HTTP bağlama ve deklaratif çıktının hazırlanması build sırasında biter. Gerçek HTTP yanıtını almak, JSON okumak ve girdiyi doğrulamak çalışma zamanında kalır. |
| Düzleştirilmiş ve atomik eylem | Eylemin yürütme ve girdi/çıktı sözleşmesi başka şema dosyasına ihtiyaç duymaz. İç içe JSON verisi korunabilir; bütün alanları tek seviyeye sıkıştırmak gerekmez. |
| Sıfır referans | Yayımlanan yürütme şemalarında çözülecek `$ref`, `$dynamicRef` veya kaynak `components` bağımlılığı kalmaz. `$schema` yalnızca sürümü belirleyen doğrulama metadatasıdır; runtime bunu ağdan indirmek zorunda değildir. İndeksten eylem detayına link ve plandaki `from`, şema referansı değildir. |
| `allOf/oneOf` işini AI yapmasın | Derleyici yalnızca anlamı koruyabildiği yapıyı dönüştürür. Genel `oneOf` dalları birleştirilmez. Desteklenmeyen bileşim veya recursion, seçilen eylem için açık derleme hatasıdır. |
| Durumsuz kullanım | AURA için ayrı bir oturum sunucusu veya sürekli protokol bağlantısı gerekmez. Hedef uygulamanın kullanıcı oturumu, token'ı ve iş durumu var olabilir. Runner'ın bir koşu içindeki ara değerleri de durumdur. |
| Evrensel `key` | Ortak niyet için beyan edilmiş bir isimdir. Aynı `key`, farklı sitelerde otomatik olarak aynı parametreleri, birimleri veya yetkiyi garanti etmez. Çalıştırma seçilen eylemin tam tanımına dayanır. |
| Sıfır özel entegrasyon | AURA destekleyen genel runtime yeni site için özel adapter istemez. Mevcut bütün ajan ürünlerinin AURA'yı kendiliğinden desteklediği iddia edilmez. |
| Beş dakikada kurulum | Mevcut API, bilinen auth ve desteklenen kaynak girdisiyle ölçülecek hızlı başlangıç hedefidir. Statik dosya, henüz var olmayan API endpoint'ini yaratmaz. |
| 100 satır, %99, 100×, 1.000 site | Tasarım motivasyonudur; ölçülmüş sonuç değildir. Satır sayısı uğruna doğruluk ve okunabilirlik feda edilmez. |

JSON Schema'da `allOf` tüm koşulları, `oneOf` tam bir dalı sağlamayı gerektirir. Property nesnelerini birleştirmek bu anlamları genel durumda korumaz. Recursive şemalar da sonlu bir ağaca her zaman tamamen açılamaz. Bu nedenle ilk profilin sınırı, vizyondan vazgeçmek yerine verdiği sözü tutmasının yoludur. Kaynaklar: [bileşim](https://json-schema.org/understanding-json-schema/reference/combining), [recursive şemalar](https://json-schema.org/understanding-json-schema/structuring#recursion).

MCP'nin zorunlu olarak kalıcı stateful bağlantı ve bütün araçları model bağlamına yükleme istediği ileri sürülmeyecek. Streamable HTTP'de session kimliği opsiyoneldir; tool listing sayfalanabilir. OpenAPI'de de Link Object ve yanıt değerlerini sonraki işleme bağlayan runtime expressions bulunur. AURA'nın değeri bu tekniklerin ilk kez bulunması iddiasına dayandırılmayacak. Kaynaklar: [MCP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management), [tool listing](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#listing-tools), [OpenAPI Link Object](https://spec.openapis.org/oas/v3.1.1.html#link-object).

## 3. Mevcut koddan tespitler

Dal ucu bu çalışma sırasında GitHub'dan kontrol edildi; önceki incelemedeki commit ile aynı. Aşağıdaki çalıştırma bulguları önceki incelemede yeniden üretildi; bu oturumda yeni uygulama veya yeni test kodu yazılmadı.

| Mevcut yer | Tespit | Bu plandaki karşılığı |
| --- | --- | --- |
| `src/constants.ts` ve `schema/` | Dalın hash'li id şeması, sabitlenen alpha.1 etiketinin sayısal ek şemasıyla uyuşmuyor. | Yeni değişmez sürüm ve paket dışından şema doğrulaması. |
| `src/normalize/index.ts` | `/auth/logout` yüksek confidence ile `session.login` olabiliyor; summary değişikliği anlamı değiştirebiliyor. | Semantik/risk tahminlerini yayın hattından çıkar; açık beyan zorunlu olsun. |
| `src/derive/from-openapi.ts` | `$ref` kopyalanırken hedef kayboluyor; parametre referansları atlanabiliyor. | Seçilen eylemin bütün gerekli yerel referanslarını derle; kaybı hataya çevir. |
| Aynı dosyanın input/binding fonksiyonları | Path, query ve body'deki aynı isimler tek property altında eziliyor. | İsim alanlarını koru ve her HTTP bağlamasını ayrı tarif et. |
| Aynı dosyanın auth/media/server çıkarımı | Security alternatifleri, bazı content type'lar ve operation server bilgisi eksiliyor. | Desteklenen alt kümeyi kayıpsız taşı; kalanını açıkça reddet. |
| `src/derive/shared.ts` | Id semantik gruba bağlı; ilk çakışmada eski eylemin adresi değişiyor. | Yayıncının açık ve sabit id'sini koru. |
| `src/publish/index.ts` | İndeks description/intent tekrarları taşıyor; href'ler kökten başlıyor; eski dosyalar kalabiliyor. | Küçük indeks, taşınabilir link, bütünlüklü ve temiz publish. |
| `src/validate/index.ts` | Bazı kontroller yalnızca dosya şemasını doğruluyor; input/result içindeki bozuk referanslar kullanılabilirlik kanıtı sayılabiliyor. | Sözleşme, yayın ağacı ve gerçek HTTP bağlama kontrollerini ayır. |
| Mevcut v2 kapsamı | Runner, `outputs/from`, yeni `AURA-State` profili ve beyan dosyası henüz yok. | Bunları mevcut özellik diye göstermeden aşamalı ekle. |

Resmî Swagger Petstore kontrolünde 19 eylem yayımlanmıştı. `createUsersWithListInput → account.list` ve `risk: low / confirm: never` sonucu, şema geçişinin anlam doğruluğu olmadığını gösterdi. Önceki build başarılıydı; tam Vitest koşusu tamamlanmadığından tüm testlerin geçtiği kabul edilmeyecek.

## 4. Beş ilkenin bağlayıcı tasarım kararları

### A. Derleme, açık beyan ve desteklenen profil

`aura.config.json` bu işte küçük, yerel ve deklaratif bir dosyadır. API'ye yeni bir çalışma zamanı katmanı eklemez. Varsayılan davranış yalnızca açıkça seçilen eylemleri yayımlamaktır.

| Beyan parçası | Karar |
| --- | --- |
| Kaynak | Yerel OpenAPI JSON veya tam mekanik tanımı içeren yeni profile uygun AURA girdisi. |
| Yayıncı ve hedef | Tarifin yayıncısı/kaynağı ile çağrılacak API hedefi ayrı belirtilir. Hedef URL, artifact'in barındığı alan adından tahmin edilmez. Üçüncü tarafın tarifini site sahibinin beyanı diye etiketleme. |
| Eylem seçimi | Sabit `id` ve kaynak operation seçicisi. OpenAPI'de method + path kesin seçicidir; operationId korunabilecek provenance'dır. Belirsiz veya bulunmayan seçim hatadır. |
| `key` | Yayıncının açık niyet beyanı. Eksikse publish edilebilir sonuç üretilmez. |
| Risk | Açık `low / medium / high` beyanı. Eksikse hata. Bu değer gerçek yetkilendirmenin veya çağıran tarafın yürütme kararının yerine geçmez. |
| Input ve HTTP bağlama | Kaynaktan mekanik olarak çıkarılır. Elle hazırlanmış AURA girdisinde aynı bilgiler açıkça verilmelidir. |
| `outputs` | Yayıncının seçtiği, adı ve tipi belli çıktı projeksiyonları. |
| `requires` | İlk profilde aynı descriptor içindeki actionId'lerden oluşan liste: ilgili hazırlık/çözüm eylemlerine keşif ipucu. Otomatik çağrı emri veya tamamlanmış login'in gelecekteki yetki garantisi değildir. |
| `errors` | Desteklenen kesin durum kodu ve varsa ilgili çözüm eylemi kimliği. |

İnsan veya ajan bu beyanı hazırlayabilir. Derleyici LLM çağırmaz, endpoint isminden anlam çıkarmaz, ham açıklama metnini çalıştırılabilir talimat saymaz. Bir LLM'in önerdiği beyan da aynı doğrulamadan geçer; bağımsız doğruluğu kanıtlanmış gibi confidence verilmez.

`key` küçük ve açık bir niyet sözlüğüyle başlayabilir: örnek akış için `session.login`, `post.create`, `post.publish`, `post.list`. Merkezden izin almayı gerektiren bir sözlük sistemi kurulmaz; yeni key'ler beyan edilebilir. Key isimlerinin anlamları belgelenir; bunların eşitliği input/output tip eşitliği yerine geçmez.

Kaynak ve beyan çatışırsa son yazan kazanmaz. Hangi kaynak JSON Pointer'ında ve hangi config alanında çatışma olduğu raporlanır. Beyan, mevcut API'nin gerçek girdi koşullarını sessizce gevşetemez.

İlk derleme profili:

- Seçilen eylemin eriştiği döngüsüz yerel `$ref` hedefleri çözülür. İlgisiz/ seçilmemiş endpoint'in şema ağacı derlenmez.
- İlk aşamada aynı belge içindeki referanslar desteklenir. Uzak veya ek dosyaya referans için açık destek eklenmediyse açıklanabilir hata verilir; runtime'a bırakılmaz ve sessiz ağ isteği açılmaz.
- İç içe object/array, scalar tipler, required, enum, nullable ve desteklenen kısıtlar veri şeklini korur. Nullable gibi OAS 3.0/3.1 farkları test edilir.
- Basit `allOf` yalnızca eşdeğerlik korunan belgelenmiş alt kümede dönüştürülür. Genel closed-object bileşimi, recursion ve dinamik referanslar desteklenmiyorsa durur.
- İlk profil genel `oneOf/anyOf` için sessiz dal seçmez. Sonraki bir varyant profili açıkça tanımlanmadan, bu yapı seçilen input'ta derleme hatasıdır. Yayıncı daha dar bir sözleşme yayımlamak isterse bunun ayrıca beyan edilmiş ve doğrulanmış olduğu açık olmalıdır.
- JSON dışı body, cookie parametresi, karmaşık query serialization veya auth kombinasyonu için destek yoksa hata verilir. Özelliği JSON'a çevirip geçmek yoktur.
- Genişleme derinliği ve çıktı boyutu için belgelenmiş sınırlar bulunur. Sınır aşımı anlam kaybıyla küçültülmez.

### B. Birbirinden ayrı üç dikkat yüzeyi

| Yüzey | Taşıdığı bilgi | Taşımadığı bilgi |
| --- | --- | --- |
| L1 — keşif indeksi | `id`, `key`, eylem detayı linki, kısa typed girdi/çıktı imzası, gerekiyorsa `requires` | Tam input/result şeması, uzun açıklama, tekrar eden intent nesnesi, ham OpenAPI parçaları |
| L2 — eylem detayı | Kesin HTTP URL şablonu, method, encoding, input ve binding, başarı durumu, `outputs`, ilgili auth/error tanımı | Dışarıdan çözülecek şema grafı veya komşu eylemin tam tanımı |
| L3 — `AURA-State` | Mevcut yanıt bağlamında bildirilen available/blocked eylemler, reason ve varsa resolve id | Yetki belgesi, token, bütün siteyi kapsadığı varsayılan kalıcı izin haritası |

Metindeki `index.json`, L1 belgesinin adıdır. Mevcut giriş adresi `/.well-known/aura.json` korunur; ilk sürümde ikinci bir zorunlu indeks GET'i eklenmez. Eylemler `/.well-known/aura/actions/{id}.json` altında kalır.

İndeksteki linkler artifact konumuna göre çözülen bağıl linklerdir. Örneğin bu yerleşimde `aura/actions/{id}.json` indeksin bulunduğu adrese göre çözülür. Hedef API URL'si ise eylem dosyasında açık ve tamamlanmıştır. Böylece aynı paket bir statik alt dizinden veya Git'in raw adresinden de tüketilebilir; linkler hedef sitenin köküne yanlışlıkla gitmez.

Bir eylem detayını alan tüketici, HTTP çağrısını kurmak için indekse veya kaynak OpenAPI'ye geri dönmek zorunda kalmaz. Yerel profile ait doğrulayıcıyı önceden bilir; schema identifier'ı yeni ağ bağımlılığı yaratmaz.

`key` aynı olan birden fazla eylem olabilir. İndeksin işlevi uygun adayı buldurmaktır; ilk eşleşmeyi körlemesine çalıştırmak değildir. Aynı `key` altındaki farklı input/output imzaları görünür kalır.

### C. HTTP bağlama ve çıktı projeksiyonu

Input sözleşmesi `path`, `query`, `header`, `body` isim alanlarını korur. `/path/id` ile `/body/id` farklı değerlerdir. Object body, path alanlarıyla birleştirilip yeni bir object şemasına dönüştürülmez. Body'nin isteğe bağlı olması ile body verildiğinde iç alanların required olması ayrı kalır.

Her request binding ayrı bir kayıtla şunları belirtir: input içindeki JSON Pointer, HTTP konumu, wire adı ve gerekiyorsa body içindeki hedef pointer. Bütün body taşınacaksa bu da açık bir bağlamadır. Kaynakta olmayan alan uydurulmaz; aynı hedefe çakışan iki yazma hata verir.

URL, OpenAPI'nin gerçekten seçilmiş server/base path ve operation path bilgisinden derlenir. `/v1` gibi base path yanlış URL birleştirmesiyle düşürülmez. Path parametresi segment olarak kodlanır; query parametresinin serialization biçimi bellidir; header adı karşılaştırması case-insensitive'dir.

`outputs` yalnızca gereken değerleri seçer. İlk profil RFC 6901 JSON Pointer kullanır: `/data/article/uuid` gibi. JSONPath motoru, wildcard sorgu, expression dili, eval veya script çalıştırma eklenmez. Slash/tilde kaçışları ve array index davranışı standarda göre işler.

Her output'un adı, kaynağı, pointer'ı, tipi ve required durumu vardır. Body'den JSON değer seçme ilk zorunlu profildir. `null`, `false`, `0` ve boş string eksik değer sayılmaz. Zorunlu pointer yoksa veya tip yanlışsa adım başarılı sayılmaz; zincirin sonraki yazması çalışmaz.

Önce HTTP başarı durumu ve beklenen content type kontrol edilir; başarısız yanıttan başarı çıktısı çıkarılmaz. 204/no-body için body gerektirmeyen açık sözleşme bulunur. Tam yanıtı LLM'e göndermek yerine yalnızca seçilmiş model-visible çıktılar ve kısa durum verilir. Credential niteliğindeki projeksiyonlar koşu içinde aktarılabilir, fakat model-visible sonuç ve normal loglara dahil edilmez.

### D. Borulama ve küçük yürütücü

`outputs` eylem tanımındadır. `from` belirli koşunun planındadır. Böylece aynı eylem farklı girdilerle birden fazla kez kullanılabilir; eylem dosyası yalnızca tek bir önceki eyleme kilitlenmez.

| Plan alanı | Karar |
| --- | --- |
| Descriptor URL | Hangi yayımlanmış AURA paketinin kullanılacağı. Hedef API ile aynı host'ta olması şart değildir. |
| `stepId` | Koşu içinde benzersiz adım kimliği. Eylem kimliğinden ayrıdır. |
| `actionId` | Descriptor kapsamındaki açık eylem id'si. `key` ile çağrı yapılmaz. |
| Girdiler | Literal değer veya önceki adımın adı verilmiş output'una referans. |
| `from` | Ayrı `step` ve `output` alanlarıyla önceki stepId ve output adı. `draftA.created_id` yalnızca anlatım kısaltmasıdır; noktalı string parçalayarak referans çözülmez. |
| Sonuç | Tamamlanan adımlar, kullanılan eylem URL/revision bilgisi, seçilmiş çıktılar ve varsa kısa hata. |

Örnek akışın anlamı: `login` adımı oturum girdisini üretir; `draftA` içerik oluşturur; `publishA`, `draftA` adımının `created_id` çıktısını `/path/id` girdisine taşır. İkinci oluşturma `draftB` olursa sonuçlar birbirine karışmaz.

Bir plan girdi ataması, hedef input pointer'ı ve tam olarak bir kaynak içerir: literal değer veya `from`. Türetilmiş credential da aynı koşu içi veri akışına katılabilir. Bir input'un hem literal hem referansla yazılması hata olur. Dış host'tan gelen credential referansı, artifact'e sabitlenmiş credential değeri değildir.

Sadece üç eylem isminin listesi, argümanları ve veri bağımlılıklarını kendiliğinden tarif etmez. Kullanıcıya kısa zincir gösterilebilir; yürütücüye verilen plan gerekli binding'leri açıkça içermelidir. Başka bir LLM bu eksikleri çalışma anında doldurmaz.

İlk runner doğrusal ve tek descriptor/tek hedef kapsamlıdır. Döngü, genel koşul dili, scheduler, paralel iş motoru, dağıtık job sistemi ve kalıcı veritabanı içermez. Bağımsız sitelerdeki ayrı koşuların paralel başlatılması çağıran host'un işidir.

Yürütmeden önce plan, bütün actionId'ler, seçilen detaylar ve `from` bağlantıları doğrulanır. Bilinmeyen adım/çıktı, ileri referans, döngü, çelişen input kaynağı ve statik olarak bilinen tip uyuşmazlığı ilk API çağrısından önce hata verir. Gerçek çıktı değerlerinin doğrulanması ilgili adım tamamlandığında yapılır.

Başarılı bilinen zincirde ara LLM çağrısı sayısı sıfırdır. JSON parse ve HTTP süresi sıfır değildir. Runner kaynak şema bileşimi çözmez, anlam tahmini yapmaz, model çağırmaz.

Auth için ilk çalışır profil açıkça sınırlandırılır: anonymous ve caller tarafından sağlanan/header'a bağlanan bearer veya API key. Login yanıtındaki gerekli token, iç output olarak sonraki isteğe bağlanabilir. Cookie jar, CSRF, OAuth etkileşimi gibi ek profiller hazır olmadan destekleniyor denmez; session.login evrensel bir auth çözümü gibi sunulmaz. Credential değerleri statik artifact'te tutulmaz.

Bearer profili, ham token'ı `Authorization` başlığında standart `Bearer ` önekiyle taşımayı açıkça tarif eder; token'ın anlamı veya hangi header'a gideceği tahmin edilmez. API key için header adı sözleşmededir. İlk profilde karmaşık auth AND/OR ifadesi desteklenmiyorsa derleme durur; anonim alternatifi silip ilk scheme'i zorunlu hale getirmez.

### E. `AURA-State`, hata ve kısmi tamamlanma

State opsiyoneldir. Hedef site bu header'ı sunmasa da açık statik tarif ve normal HTTP sonuçlarıyla yürütme çalışır. Bu koşul, üçüncü taraf/ajan yayınlarının da önünü açık tutar.

Yeni profil v1 formatıyla sessizce karıştırılmaz. İlk küçük format için sürüm öneki ve base64url ile taşınmış compact JSON kullanılır; decoded payload şeması version/revision, eylem id, availability, reason ve isteğe bağlı resolve id alanlarını tanımlar. Önek ve encoding dokümanda tek bir şekilde sabitlenir. Karmaşık serbest metin veya ayrı bir ifade dili eklenmez.

Taslak wire öneki `AURA-State: v=2;data=<base64url>` olarak sabittir. Decoded nesnenin `version`, `revision`, `actions` alanları vardır. Her entry `id`, `availability` (`available` veya `blocked`), isteğe bağlı kısa `reason` ve `resolve` actionId'si taşır. `unknown` wire'da bir izin ilanı değildir; eksik veya kullanılamayan gözlemin tüketici tarafındaki sonucudur.

Her gözlem ilgili yanıt ve credential bağlamıyla sınırlıdır. Bir id yoksa durumu unknown'dur; available veya blocked olduğu çıkarılmaz. İlk profil kalıcı delta senkronizasyonu vaat etmez. Geçersiz, aşırı büyük veya farklı revision'a ait header, API başarısını değiştirmeden yok sayılabilir bir tanı üretir; eski izin bilgisi yeni oturum için gerçek sayılmaz.

`resolve`, seçilmiş artifact içindeki bir actionId'yi belirtir. `session.login` ancak o eylemin gerçekten id'siyse bir çözüm adresidir. Bu alan eylemi çalıştırma emri değildir. 401'in daima login ile, 403'ün yeniden login ile çözüleceği varsayılmaz.

Runner ilk profilde header'a bakarak yeni bir eylemi kendiliğinden plana eklemez. Gerekli login/recovery zaten verilen plana dahilse deterministik olarak yürür. Beklenmedik blokajda kısa `blocked` sonucu, reason ve çözüm adayı döner; dış ajan gerekirse yeni plan kurar. Bunun için core'a onay ekranı veya insan arayüzü eklenmez.

İlk runner otomatik mutasyon tekrarı yapmaz. Timeout veya bağlantı kopması isteğin uygulanmadığını kanıtlamaz. Bu durumda çıktı `outcome-unknown` olur; sonraki adımlar durur. Daha önce başarılı oluşturma varsa bu adım kaybolmuş gibi raporlanmaz. Zincir transaction veya otomatik rollback değildir. İleride idempotency ile retry desteklenecekse ayrı ve test edilmiş bir sözleşme gerekir.

### F. Kalıcı kimlik ve yayın bütünlüğü

`id` yayıncının seçtiği, descriptor içinde benzersiz ve dosya adına uygun sabit kimliktir. Derleyici bunu semantic key, kardeş sayısı, sıralama, summary veya yerel dosya yolundan yeniden üretmez. Aynı girdiden aynı sonuç çıkar; başka eylem eklenmesi eski id'yi etkilemez.

`key` niyeti taşır. `id` ile aynı string olabilir; bu bir bağımlılık değildir. `key` düzeltildiğinde id'nin otomatik değişmesi gerekmez. Tam eylem adresi artifact konumu + id ile oluşur; bütün web için merkezi kimlik tahsis sistemi gerekmez.

Mevcut yayımlanmış id korunmak isteniyorsa beyana açıkça taşınır. Hash'li eski bir id de sabit string olarak korunabilir. Yeni profil, eski adresi yeni bir algoritmayla sessizce yeniden adlandırmaz. ActionId emekliye ayrılırsa başka bir anlam için yeniden kullanılmaz. Host/domain taşımak yayıncı operasyonudur; derleyici dışındaki yönlendirmeyi garanti edemez.

İndeks ve eylem dosyalarında build revision'ı bulunur. Revision içerik değişimini izler; id'nin yerine geçmez. Ayrı HTTP GET'lerinde cache yüzünden farklı revision'lar karışırsa runner yürütmeye geçmez. Revision tutarlılık işaretidir; kriptografik yayıncı kimliği kanıtı sayılmaz.

Publish bütün dosyaları staging'de doğrular, sonra belgelenmiş yerel commit stratejisiyle yayımlar. Hata, önceki geçerli çıktıyı yarım bırakmaz. Yalnızca kendisine ait üretilmiş dosyalar temizlenir; ilgisiz kullanıcı dosyaları silinmez. Hosting/CDN'nin atomik deploy garantisi varmış gibi davranılmaz; tüketici revision kontrolü bu nedenle de gerekir.

## 5. Kapsam, kodun biçimi ve sınır güncellemesi

Bu işin kapsamı: küçük deklaratif config, deterministik derleme, üç dikkat yüzeyinin sözleşmesi, outputs/from ve küçük bir reference runner profili.

Core; browser automation, crawler, hosted registry/bridge, imza servisi, ödeme sistemi, LLM planner veya büyük uygulama framework'ü içermez. Ajanın tarif öğrenmesi ve dosyayı paylaşması mümkün olsun; bunun için yeni bir tarayıcı veya merkezi ağ kurulmasın.

Mevcut `AGENTS.md` ve README, demo client/remote runtime eklenmesini dışarıda bırakıyor. Kullanıcının bu vizyonu küçük bir runner sözleşmesini açıkça kapsıyor. Uygulama aşamasında dokümanlar buna göre dar bir istisnayla güncellenmeli: tek paketli workspace, küçük deterministik yürütücü; demo app/server/client stack yasağı devam eder. Bu plan için ek izin sorusu veya kapsamın sessizce daraltılması gerekmiyor.

Mevcut klasörler ve düz fonksiyonlar kullanılmalı. Her alt konu için yeni factory, registry, base class ve adapter sınıfı oluşturulmamalı. Runner'ın API sınırı ile CLI giriş noktası yeterli olmalı; test fixture'ları kullanıcıya sunulan demo servisi değildir. Runtime, compiler modüllerini import ederek kaynak şema çözümünü dolaylı yoldan geri getirmemeli.

## 6. Uygulama sırası ve teslim kapıları

Her kapı çalışır bir dilim bırakır. Derleme/publish doğruluğu sağlanmadan runner'a geçilmez. Bütün yeni formatlar aynı sonraki alpha profilinin taslağı olarak önce belgelenir; yayımlanmış eski alpha etiketi yeniden yazılmaz.

### G0 — Sözleşmeyi ve başlangıç durumunu sabitle

- [ ] İncelenen SHA, çalışma ağacı ve mevcut test durumu kayda alınsın. Başarısız/tamamlanmamış koşu başarı sayılmasın.
- [ ] `aura.config.json`, L1, L2, plan ve State için bu dosyadaki alan anlamları tek bir kısa spec'te sabitlensin. Yeni formatlar implementasyon başlamadan birbiriyle çelişmesin.
- [ ] Mevcut `AGENTS.md`, README ve architecture-seams belgesi yalnızca küçük runner kapsamını açıklayacak kadar güncellensin.
- [ ] Önceki alpha'dan kırılan alanlar açıkça listelensin: heuristik confidence/intent zorunluluğu, hash id türetme, input/binding düzeni ve State formatı.

**Kapı:** İd, key, stepId, revision, hedef API ve artifact URL farklı şeyler olarak tanımlanmış; açık semantik/risk beyanının eksikliği hata olarak kararlaştırılmış olsun.

### G1 — Beyan, eylem seçimi ve sabit kimlik

- [ ] OpenAPI + config ve tam beyan edilmiş AURA girdisi aynı doğrulanan normal forma ulaşsın. İkinci yol için crawler veya browser yazılmasın.
- [ ] Yalnızca seçilmiş eylemler derlensin. Eksik key/risk, bilinmeyen operation, tekrar eden id ve çelişkili hedef derlemeyi durdursun.
- [ ] `normalizeActionSemantics`, `inferRisk`, `inferConfirm` ve collision-adjusted confidence yayın hattından çıkarılsın. Başka dosyada gizli tahmin olarak geri getirilmesin.
- [ ] Id config'ten korunarak taşınsın; `shared.ts` id'yi yeniden hash'leyip değiştirmesin. Semantic key çakışması geçerli, id çakışması hatalı olsun.
- [ ] Hata çıktısı tanı kodu, kaynak pointer ve config pointer içersin. Kimlik bilgileri veya tam hassas response dump edilmesin.

**Kapı:** `/auth/logout` kendi açık beyanıyla logout kalır; eksik anlamla “başarılı” çıktı üretilemez. İkinci/üçüncü kardeş eylem eklemek veya kaldırmak eski id'leri değiştirmez.

### G2 — Kendi kendine yeten ve kayıpsız HTTP eylemi

- [ ] `from-openapi.ts` seçilmiş operation'ın parameter, requestBody, response ve schema referanslarını desteklenen profil içinde çözsün; atlama/kopyalayıp hedefi düşürme davranışı bitsin.
- [ ] Şema normalizasyonunun desteklediği keyword'ler ve OAS sürümleri belgelenip test edilsin. Anlamı korunamayan yapı hataya dönsün.
- [ ] Input isim alanları ve ayrı binding kayıtları uygulansın; path/query/header/body isim çakışması kayıp yaratmasın.
- [ ] Server seçim önceliği, base path, path encoding, query serialization ve header davranışı kesinleştirilsin. Desteklenmeyen kombinasyon sessizce varsayılan server/JSON'a dönmesin.
- [ ] JSON body ve response profili, optional body ve no-content başarı durumuyla birlikte çalışsın. Auth alternatifleri keyfi olarak ilk scheme'e indirgenmesin.
- [ ] Çıktı şeması kendi başına offline doğrulanabilsin; source OpenAPI veya components ağacına ihtiyaç kalmasın.

**Kapı:** Her seçili eylem için ya tam yürütülebilir dosya ya konumlu hata çıkar. İçi boşaltılmış ama şemadan geçen eylem başarılı sonuç değildir.

### G3 — Küçük indeks, yayın ve sürüm doğruluğu

- [ ] Mevcut `aura-v2`, `aura-action`, `aura-publish` şemaları ve TypeScript tipleri aynı sözleşmeye getirilsin. Yeni config/plan/State veri biçimleri gerektiği kadar şemalansın.
- [ ] `toPublishedIndex` kısa imza + gerekli keşif alanları üretsin. Yeni root route veya ikinci zorunlu index dosyası yaratılmasın.
- [ ] Href'ler descriptor konumuna göre çözülsün; detayın HTTP hedefi artifact host'undan bağımsız kalsın.
- [ ] Revision, duplicate id, bozuk href, indeks/detay uyumu, temiz publish ve başarısız publish sonrası eski çıktının korunması kontrol edilsin.
- [ ] Şema URL'leri güncel kaynakla eşleşen yeni, değişmez alpha sürümüne bağlansın. Paket içi ve yayınlanan şema byte'ları karşılaştırılsın.
- [ ] `npm pack` çıktısı ayrı dizinde, repo kökünden ve CWD schema fallback'inden yararlanmadan kurulup doğrulansın.

**Kapı:** Yayımlanan belgenin kendi işaret ettiği şema onu gerçekten kabul etsin. Paketlenmiş CLI, editör/harici validator ve dosya ağacı aynı sonucu versin.

### G4 — Outputs ve deterministik zincir

- [ ] Eylem dosyasında typed output projection; planda stepId, actionId ve `from` veri bağlaması uygulansın.
- [ ] İlk istekten önce statik plan doğrulaması yapılsın. Yalnızca gereken eylem detayları alınsın.
- [ ] HTTP isteği, response kontrolü, pointer projection ve sıradaki input bağlaması küçük runner tarafından yürütülsün. Başarı yolunda LLM çağrısı olmasın.
- [ ] Aynı eylem iki stepId ile çağrıldığında ara sonuçlar ayrışsın. Output eksikliği veya tip hatasında downstream mutasyon çalışmasın.
- [ ] Başarı sonucu yalnızca seçilmiş çıktıları, kısa statüyü ve kullanılan eylem/revision bilgisini taşısın. Tam yanıt ve credential iç output'ları modele taşınmasın.
- [ ] Hata/kısmi tamamlanma ve timeout sonrası bilinmeyen sonuç doğru raporlansın. Otomatik mutation retry/rollback bulunmasın.

**Kapı:** Giriş → oluşturma → yayımlama için önceden verilmiş tek plan çalışsın; id/token taşımak için ajan tekrar çağrılmasın. Tam response'u prompt'a gizlice taşıyan çözüm bu kapıyı geçmez.

### G5 — Opsiyonel State ve açık hata sonucu

- [ ] Küçük, sürümlü State encoding/parsing ve payload doğrulaması uygulansın. Header uzunluğu için belgelenmiş sınır bulunsun.
- [ ] Available/blocked/unknown, reason ve resolve id bağlama kuralları spec ve testlerle aynı olsun.
- [ ] State vermeyen hedef API ile aynı desteklenen zincir çalışsın. Malformed/stale State doğru HTTP sonucunu bozmasın.
- [ ] 401/403/429 ve declared resolver id kısa, yapılandırılmış sonuç olarak ele alınsın. Header plan dışı eylem çalıştırmasın.

**Kapı:** State bağlamı aydınlatır; yeni bir oturum protokolü, yetki sistemi veya kontrolsüz recovery zinciri haline gelmez.

### G6 — Dağıtım, bağımsız tüketim ve ölçülmüş gösteri

- [ ] Aynı static artifact hem site-hosted well-known adresten hem hedef API'den farklı bir static alt dizin/raw adresten tüketilsin. Hedef API'de ikinci yol için AURA header'ı veya dosyası gerekmesin.
- [ ] İnsan veya ajan tarafından hazırlanmış tam beyanla aynı üretim hattı gösterilsin. Kaynak/yayıncı/sürüm görünür kalsın; merkezi kayıt veya AURA sahibinin onayı gerekmeyecek biçimde paket taşınabilsin.
- [ ] Ortak test vektörlerini kullanan bağımsız bir minimal tüketici aynı HTTP method/URL/header/body ve projected output sonucunu elde etsin. Aynı request-builder'ı iki wrapper ile çağırmak bağımsızlık sayılmasın.
- [ ] README hızlı başlangıcı temiz ortamda denensin; ön koşullar ve beş dakikalık hedefin nereden başladığı yazılsın.
- [ ] Aşağıdaki doğruluk ve ölçüm tabloları gerçek sonuçlarla doldurulsun. Ölçülmeyen yüzdeler ve hız katsayıları çıkarılsın.

**Kapı:** Gösteri, kendi ürettiğini kendi parser'ının kabul etmesini aşsın: yayımlanan aynı sözleşme siteye özel kod olmadan bağımsız tüketimden geçsin.

## 7. Kabul senaryoları

Bu tablo uygulamayı tekrar eden sıradan unit test listesi değildir. Yakalanması gereken davranış ve gerilemelerin sözleşmesidir. Testler fixture'larla küçük kalmalı; başarı sayacı ürün doğruluğunun yerine geçmemelidir.

| No | Senaryo | Beklenen sonuç |
| --- | --- | --- |
| 1 | Açık key/risk olmadan seçilmiş eylem | Konumlu derleme hatası; yayınlanabilir dosya yok. |
| 2 | Logout, listUserOrders, summary içinde “user” | Yalnızca beyan edilen anlam; inference/confidence yok. |
| 3 | Aynı key altındaki eylem sayısı 1→2→3→2→1 | Mevcut id ve href'ler değişmez. |
| 4 | Aynı kaynak başka yerel klasöre taşınır; object alan sırası değişir | Canonical artifact byte'ları değişmez. |
| 5 | Key veya açıklama düzeltilir, id korunur | Locator sabit; içerik revision'ı değişir. |
| 6 | Input, requestBody, response ve parameter içinde yerel `$ref` | Gerekli tanım açılmış; yayımlanan runtime şemasında `$ref` yok. |
| 7 | Recursive/remote ref veya desteklenmeyen bileşim | Hata; sonsuz genişleme, sessiz alan düşürme veya runtime ref fetch yok. |
| 8 | Güvenle birleştirilemeyen closed-object `allOf`; genel `oneOf` | Kabul edilen değer kümesini değiştirerek düzleştirme yok. |
| 9 | Path/query/header/body aynı isimli değerler taşır | Hepsi ayrı tip ve değerle doğru HTTP konumuna gider. |
| 10 | Body opsiyonel; verilirse bir alanı required | Body yokluğu ve eksik required alan ayrı doğrulanır. |
| 11 | Base URL `/v1`, operation server override, özel karakterli path argümanı | Doğru hedef ve encoding; destek dışı override varsa derleme hatası. |
| 12 | Desteklenmeyen form/multipart/auth kombinasyonu | JSON veya ilk auth scheme'e sessiz düşüş yok. |
| 13 | Yayın `$schema` URL'si ve npm tarball ayrı ortamda kullanılır | Repo şemasına fallback olmadan aynı geçerli sözleşme. |
| 14 | Kırık href, duplicate id, indeks/detay farklı revision | Yayın veya yürütme engellenir; yanlış eylem çalışmaz. |
| 15 | Eylem kaldırılır veya publish yarıda hata verir | Sahip olunan eski çıktı doğru temizlenir; ilgisiz dosya ve önceki geçerli yayın korunur. |
| 16 | Response 50 KB; sıradaki adım yalnızca bir id kullanır | Model-visible veri yalnızca seçilen çıktı; raw response taşınmaz. |
| 17 | Output false, 0, boş string veya null | Tanımlı tipe göre doğru değer; missing ile karışmaz. |
| 18 | Pointer'da `/`, `~` ve array index bulunur | RFC 6901'e uygun erişim. |
| 19 | Zorunlu output eksik veya yanlış tipli | Adım hata verir; downstream yazma yapılmaz. |
| 20 | Aynı create eylemi draftA ve draftB olarak iki kez çağrılır | PublishA yalnızca seçilen draftA çıktısını kullanır. |
| 21 | Bilinmeyen/ileri `from`, tip uyuşmazlığı, duplicate stepId | İlk API çağrısından önce plan hatası. |
| 22 | Önceden hazırlanmış login/create/publish planı | Başarı yolunda sıfır ara LLM çağrısı; token yalnızca koşu içinde taşınır. |
| 23 | Header yok, malformed, büyük veya stale | Unknown/uygun tanı; normal HTTP akışı korunur. |
| 24 | 401/403 ve resolve id bulunur | Çözüm bilgisi raporlanır; plan dışı otomatik login veya mutasyon tekrarı yok. |
| 25 | Create başarısından sonra publish reddi; create sırasında timeout | İlkinde kısmi tamamlanma, ikincide outcome-unknown; hayalî rollback/başarı yok. |
| 26 | Paket başka bir host/alt dizine taşınır | Href'ler artifact adresine, request ise açık hedef API'ye gider. |
| 27 | Aynı key, farklı sitelerde farklı imza | Adaylar ayırt edilir; key tek başına kör yürütme başlatmaz. |
| 28 | Bağımsız tüketici ortak vektörleri okur | Aynı request ve projection; bir implementation'ın özel davranışına bağımlılık yok. |

## 8. Ölçümler ve yayına hazırlık

Sıfır ağ gecikmesi veya sıfır parse maliyeti raporlanmayacak. Derleme maliyeti ile her görevdeki tekrar eden maliyet ayrı ölçülecek. İlk istek, cache'li koşu ve hata sonrası yeniden planlama birbirine karıştırılmayacak.

| Ölçüm | Kaydedilecek sonuç |
| --- | --- |
| 1/10/50 eylemli L1 | Minify edilmiş byte, seçilen tokenizer/sürüm varsa gerçek token sayısı |
| Bir L2 eylemi | Byte, açılmış şema büyüklüğü, bağımlı şema fetch sayısı: 0 |
| Bir ve üç adımlı görev | API/detail GET sayısı, toplam süre, runtime parse/projection süresi |
| Ara çıktı aktarımı | Tam response byte'ı, modele verilen byte/token, ara LLM çağrısı: başarı yolunda 0 |
| Doğruluk | Beklenen method/URL/header/body, doğru çıktı ve doğru hata/kısmi sonuç |
| Derleme | Seçilen operation sayısı, süre ve tepe bellek; destek dışı eylemler ayrı raporlanır |
| Kurulum | Mevcut API + hazırlanmış kaynak/config ile temiz ortamda ilk publish ve ilk tüketim süresi |

Karşılaştırma tam OpenAPI, ilgili işlemlere kırpılmış OpenAPI + genel yürütücü ve AURA'yı içermeli. Piping avantajı, yalnızca her ara adımda LLM'e dönen zayıf bir baseline ile kıyaslanmamalı. Aynı başarı doğruluğu, auth, veri, görev ve cache koşulları korunmalı. Desteklenmeyen endpoint'leri ölçümden çıkarmak açıklanmalı.

Paket hazır olunca yeni alpha sürümü, şema etiketleri, README, npm komutları ve aktif branch bilgisi uyumlu hale getirilecek. Eski alpha etiketi değiştirilmeyecek. CI uygulama dalında/PR'da build ve anlamlı scenario kontrollerini gerçekten çalıştıracak.

Tamamlanma kontrolleri: `pnpm install`, `pnpm build`, `pnpm test --run`; ayrıca paket arşiviyle repo dışı doğrulama, schema URL eşleşmesi ve kabul senaryoları. Test süreci kapanmadıysa tamamlandı yazılmayacak.

## 9. Değişikliklerin kod tabanındaki yeri

| Mevcut yer | Beklenen iş |
| --- | --- |
| `packages/aura-protocol/src/schema/types.ts` ve `schema/` | Beyan, L1/L2, input binding, outputs, plan ve State sözleşmelerini hizala; heuristik confidence zorunluluğunu kaldır. |
| `src/derive/from-openapi.ts`, `derive/index.ts`, `derive/shared.ts` | Açık seçim, referans çözümü, mekanik çıkarım, sabit id ve hata üretimi. |
| `src/normalize/index.ts` | Semantik tahminleri aktif yayın yolundan çıkar; yalnızca gerçekten mekanik temsil temizliği kalabilir. |
| `src/canonical.ts` | Stabil serialization korunsun; alan isimlerine bakarak anlam taşıyan dizi sırası değiştirilmesin. |
| `src/publish/index.ts`, `filesystem.ts` | Küçük indeks, bağıl href, revision, staging/temizleme ve bütünlük. |
| `src/validate/index.ts`, `constants.ts` | Profile uygun validation ve tek sürüm gerçeği; runtime schema fetch zorunluluğu yaratma. |
| `src/cli/run.ts` ve mevcut CLI girişleri | `derive` için config yolu; `derive/publish/validate` hikâyesi korunsun. Tüketim için küçük ayrı `aura-runner` girişi. |
| Küçük yeni runner alanı | Plan kontrolü, HTTP binding, projection, kısa state/error sonucu. Compiler'ı tekrar çalıştıran runtime yok. |
| `tests/scenarios/`, `examples/` | Davranış vektörleri ve statik örnek girdiler/çıktılar. Kullanıcıya sunulan demo server stack'i ekleme. |
| README, spec, rationale, migration, CI | Yeni kapsamı, kırılan sözleşmeleri ve gerçek komutları birlikte güncelle. |

## 10. Bitti denebilmesi için

- [ ] Derleyici hiçbir anlam/risk confidence'ı uydurmuyor; eksik beyanı reddediyor.
- [ ] Yayımlanan destekli eylemler kendi kendine yetiyor; source OpenAPI ve şema grafı runtime'a taşınmıyor.
- [ ] Kimlikler kardeş eylemlerden, semantik tahminlerden ve yerel dosya konumundan etkilenmiyor.
- [ ] L1/L2/State sınırları ayrı; State opsiyonel; üçüncü taraf dağıtım gerçekten çalışıyor.
- [ ] Runner tek verilmiş planı, doğru HTTP ve doğru veri aktarımıyla ara LLM olmadan yürütüyor.
- [ ] Çıktı projeksiyonu hataları, auth blokajı, timeout ve kısmi tamamlanma dürüstçe raporlanıyor.
- [ ] Genel tüketici desteğinin ne gerektiği açık; bütün ajan ürünlerine entegrasyon ve bütün sitelerde hatasızlık vaat edilmiyor.
- [ ] Ayrı tüketim ve doğru baseline karşılaştırması var; performans cümleleri ölçümlerden geliyor.
- [ ] Bütün bunlar küçük bir paket, düz ve okunabilir işlevler, statik artifact'ler ve açık sözleşme sınırlarıyla elde ediliyor.

## Kaynaklar

- [İncelenen AURA commit](https://github.com/osmandkitay/aura/tree/ba534d1983a2ee3b90c687bef7474393c6c3d589)
- [Kapsam talimatı](https://github.com/osmandkitay/aura/blob/ba534d1983a2ee3b90c687bef7474393c6c3d589/AGENTS.md)
- [Derleme kodu](https://github.com/osmandkitay/aura/blob/ba534d1983a2ee3b90c687bef7474393c6c3d589/packages/aura-protocol/src/derive/from-openapi.ts)
- [Mevcut id/finalization kodu](https://github.com/osmandkitay/aura/blob/ba534d1983a2ee3b90c687bef7474393c6c3d589/packages/aura-protocol/src/derive/shared.ts)
- [Yayın kodu](https://github.com/osmandkitay/aura/blob/ba534d1983a2ee3b90c687bef7474393c6c3d589/packages/aura-protocol/src/publish/index.ts)
- [JSON Schema bileşim kuralları](https://json-schema.org/understanding-json-schema/reference/combining)
- [JSON Schema referans/recursion kuralları](https://json-schema.org/understanding-json-schema/structuring)
- [RFC 6901 JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901.html)
- [OpenAPI 3.1.1, Link Object ve HTTP bağlama](https://spec.openapis.org/oas/v3.1.1.html)
- [MCP 2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP 2025-11-25 tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
