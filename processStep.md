STEP 1

1. Gereksiz Bağımlılıkları ve Konfigürasyonları Kaldır.
* aura/packages/reference-server/eslint.config.mjs
* aura/packages/reference-server/tsconfig.json
* aura/packages/aura-protocol/tsconfig.json
* aura/tsconfig.json

* **Komut:** `aura/packages/reference-server/eslint.config.mjs` dosyasını **sil**. Linting, v0.1'den sonra eklenecek.
* **Komut:** Tüm `tsconfig.json` dosyalarındaki `"extends"` ve `"paths"` gibi karmaşık ayarları kaldır. Her paketin kendi basit, bağımsız `tsconfig.json` dosyası olsun. Kök dizindeki `tsconfig.json` dosyasını şimdilik **sil**.
* **Komut:** Kök dizin terminalinde şu komutu çalıştırarak kullanılmayan bağımlılıkları **kaldır**:
    ```bash
    pnpm rm -r commander chalk cookie @eslint/eslintrc eslint eslint-config-next
    ```
--
2. Kullanılmayan API Uç Noktalarını İmha Et.
* aura/packages/reference-server/pages/api/csrf-token.ts
* **Komut:** Yukarıda listelenen iki dosyayı da projeden tamamen **sil**. v0.1'de bir amaçları yok.

--
3. v0.1 İçin Güvenlik Modelini Basitleştir.
* aura/packages/reference-server/pages/api/posts/[id].ts
* aura/packages/reference-server/pages/api/posts/index.ts
* aura/packages/reference-server/pages/api/user/profile.ts

* **Komut:** Listelenen tüm API dosyalarından `X-CSRF-Token` başlığını kontrol eden tüm `if` bloklarını ve ilgili hata mesajlarını **kaldır**. v0.1, CSRF koruması olmadan yayınlanacak. Bu, v0.2'de eklenecek bir özelliktir.

4. Protokol Tanımını v1.0'a Kilitle ve Sadeleştir.
* aura/packages/aura-protocol/src/index.ts
* aura/packages/aura-protocol/scripts/generate-schema.ts
* aura/packages/reference-server/public/.well-known/aura.json

* **Komut:** `index.ts` dosyasını aç.
    * `AuraManifest` arayüzündeki `version` alanını `'1.3'` yerine `'1.0'` olarak **değiştir**.
    * `Policy` arayüzündeki `authHint` özelliğinden `'oauth2'` ve `'401_challenge'` seçeneklerini **kaldır**.
    * `Policy` arayüzünden `cookieNames?: string[]` satırını tamamen **sil**.
    * `HttpAction` arayüzündeki `encoding` özelliğinden `'form-data'` ve `'multipart'` seçeneklerini **kaldır**.
    * `HttpAction` arayüzündeki `security` özelliğini ve tanımını tamamen **sil**. v0.1'de bu olmayacak.
* **Komut:** `generate-schema.ts` dosyasında, üretilen şemanın `$id` ve `title` alanlarını `v1.0` olarak **güncelle**.
* **Komut:** `aura.json` manifest dosyasını aç.
    * `version` alanını `'1.0'` olarak **değiştir**.
    * CSRF kontrolleri kaldırıldığı için, `security` nesnesini içeren tüm `create_post`, `update_post`, `delete_post` ve `login` yetkinliklerinden bu nesneyi tamamen **sil**.

--
--
STEP 2

Amaç: Protokolün değerini kanıtlayan, baştan sona çalışan ve güvenilir bir deneyim sunmak.

1. Temel Sorumluluğu Yerine Getir: Parola Güvenliği.
* aura/packages/reference-server/package.json
* aura/packages/reference-server/pages/api/auth/login.ts

* **Komut:** `reference-server` dizininde `pnpm add bcryptjs && pnpm add -D @types/bcryptjs` komutunu **çalıştır**.
* **Komut:** `login.ts` dosyasını aç.
    * `import * as bcrypt from 'bcryptjs';` satırını en üste **ekle**.
    * `users` dizisindeki `password: 'password123'` satırını, `passwordHash: await bcrypt.hash('password123', 10)` ile oluşturulmuş bir hash ile **değiştir**.
    * `users.find` mantığını, düz metin karşılaştırması yerine `bcrypt.compare` kullanacak şekilde **yeniden yaz**.
    * Tüm `// In production...` yorumlarını **sil**.

--
2. Referans Ajanı Eksiksiz Çalışır Hale Getir.
* aura/packages/reference-client/package.json
* aura/packages/reference-client/src/agent.ts

* **Komut:** `reference-client` dizininde `pnpm add axios-cookiejar-support tough-cookie && pnpm add -D @types/tough-cookie` komutunu **çalıştır**.
* **Komut:** `agent.ts` dosyasını aç.
    * `axios-cookiejar-support` ve `tough-cookie`'yi import et. `axios` yerine cookie'leri destekleyen yeni bir `client` örneği oluştur ve tüm `axios` çağrılarını bu yeni `client` ile **değiştir**.
    * `executeAction` fonksiyonundaki hatalı `urlTemplate.split('{')[0]` mantığını, parametreleri `{param}` formatından alan ve değiştiren basit bir `replace` mantığı ile **düzelt**.
--
3. Projeye Güven İnşa Et: Test ve CI.
* aura/package.json (kök)
* aura/packages/aura-protocol/package.json
* aura/.github/workflows/ci.yml (yeni dosya)
* aura/packages/aura-protocol/src/index.test.ts (yeni dosya)

* **Komut:** Kök dizinde `pnpm add -D -w vitest @vitest/coverage-istanbul` komutunu **çalıştır**.
* **Komut:** Kök `package.json` dosyasına `"test": "vitest"` script'ini **ekle**.
* **Komut:** `aura-protocol` paketi içine, `aura-validate` CLI'ını kullanarak kendi manifest'inin geçerli olup olmadığını kontrol eden tek bir `index.test.ts` dosyası **oluştur**.
* **Komut:** `pnpm install` ve `pnpm test` komutlarını çalıştıran basit bir `ci.yml` GitHub Actions workflow dosyası **oluştur**.

--


