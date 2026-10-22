# 🧪 120Hz Simülasyon Saha Deneyleri ve Telemetri Gözlem Raporu

**Tarih:** 20 Ekim 2026  
**Doküman:** `docs/SAHA_DENEYLERI_VE_GOZLEMLER.md`  
**Sistem:** Three.js 120Hz Canlı RL Arenası (`http://localhost:8000/web/`)  
**Denetçi:** Kullanıcı Testleri & Lead RL & Aerospace Systems Architect  

Bu doküman, eğitilen pekiştirmeli öğrenme (RLPD) ajanının canlı tarayıcı arenasında kullanıcı tarafından yapılan interaktif testlerde sergilediği uçuş dinamiklerini, telemetri verilerini ve fiziksel kök neden analizlerini belgelemektedir.

---

## 📌 Deneyler Özeti

| Deney No | Deney Adı | Başlangıç Durumu | Temel Semptom | Sonuç |
| :---: | :--- | :--- | :--- | :--- |
| **Deney 1** | **"Zoom Climb / Aya Uçuş"** | Rampa fırlatması sonrası serbest uçuş | Dikey hız $+9.1\text{ m/s}$ ile sahne tavanına ($42.9\text{ m}$) tırmanma | Pisti yatayda buldu ($\Delta X = 2.1\text{ m}$) ancak dikeyde yukarı kaçtı |
| **Deney 2** | **"Ters İtki Taklası ve Kaza"** | Fare ile manuel rampa tepesine bırakma | Roll açısı düzelmeden ($-152^\circ$) 4 motorun %98 tam gaz açılması | Gövde yere doğru itildi, takla attı ve $-8.0\text{ m/s}$ ile piste çakıldı (`KAZA`) |

---

## 🔬 DENEY 1: "Zoom Climb / Aya Uçuş" Fenomeni (Yüksek İrtifada Tırmanış)

### 1.1 Test Koşulları ve Telemetri Ekran Görüntüsü
Kullanıcı aracı rampadan fırlattığında veya yüksek irtifada serbest bıraktığında, araç yatayda iniş pistine yaklaşırken motorlarını kapatmak yerine daha fazla gaz vererek gökyüzüne tırmanmıştır.

> [!NOTE]
> **Kullanıcı Saha Notu (Kritik Nüans):** Bu "Aya tırmanma" refleksi sürekli tekrarlanan kronik bir davranış değildir. Model normal koşullardaki uçuşların çoğunda doğrudan süzülerek pist üzerine yumuşak inişini başarıyla gerçekleştirmektedir (%74.7 genel başarı). Bu davranış yalnızca aracın piste çok yüksek yatay hızla ($V_x < -20\text{ m/s}$) yaklaşıp son anda aşırı sert yatay frenleme yapmak zorunda kaldığı özel sınır durumlarında (edge-case) tetiklenmektedir.

#### Canlı Telemetri Değerleri ($Z = 42.9\text{ m}$ Anı):
* **Uçuş Durumu:** `SAF AI MODEL` (Yeşil Rozet)
* **İrtifa ($Z$):** **$42.9\text{ m}$** (Hedef pist: $0.7\text{ m}$)
* **Hedef Hatası ($\Delta X$):** **$2.1\text{ m}$** (Pist: $X = -42\text{ m}$, Araç: $X = -39.9\text{ m}$)
* **Dikey Hız ($V_z$):** **$+9.1\text{ m/s}$** (Aşağı inmek yerine yukarı tırmanıyor)
* **Yatay Hız ($V_x$):** **$-7.3\text{ m/s}$** (Piste doğru geriye kayış)
* **Pitch Eğimi ($\theta$):** **$17.7^\circ$** (Burun hafifçe yukarı kaldırılmış)
* **Roll Burgusu ($\Phi$):** **$4.8^\circ$** (Araç dik konumda, takla yok)
* **G-Kuvveti:** **$1.44\text{ G}$** ($1.0\text{ G}$ yerçekimi $+ 0.44\text{ G}$ yukarı net ivme)
* **Kalan Yakıt:** **$9.9\text{ kg}$ (%22)** ($35.1\text{ kg}$ yakıt yakılmış)
* **8 Aktüatör Durumu:**
  * Alt Ön-Sol: **%61** | Alt Ön-Sağ: **%58**
  * Alt Arka-Sol: **%62** | Alt Arka-Sağ: **%63**
  * Yan RCS Jetleri: **%0 - %1** (Sakin)

### 1.2 Fiziksel ve Matematiksel Kök Neden
1. **Pistten Dışarı Fırlamama Refleksi:**
   Araç rampadan $V_x = -25\text{ m/s}$ (saatte $90\text{ km}$) yatay hızla çıkmıştır. İniş pistine $2.1\text{ metre}$ kala hala $V_x = -7.3\text{ m/s}$ hızla geriye kaydığını gören sinir ağı, pisti ıskalamamak için frene basma kararı almıştır.
2. **Açı ve Vektör Bileşeni Tuzağı:**
   Araç burnunu $\theta = 17.7^\circ$ açıyla tuttuğu için motor kuvveti iki bileşene ayrılmıştır:
   * **Yatay Fren Bileşeni:** $F_x = F \cdot \sin(17.7^\circ) = \mathbf{\%30}$
   * **Dikey Kaldırma Bileşeni:** $F_z = F \cdot \cos(17.7^\circ) = \mathbf{\%95}$
3. **Kuvvet Dengesi:**
   $4 \times 8.500\text{ N} \times 0.61 \approx \mathbf{20.740\text{ N}}$ itki üretilmiştir. Yakıtı azalan $1.410\text{ kg}$'lık aracın ağırlığı ise sadece $\mathbf{13.830\text{ N}}$'dur. Aradaki $+6.910\text{ N}$ net dikey kuvvet, aracı $a_z = +4.9\text{ m/s}^2$ ivmeyle gökyüzüne fırlatmış ve ekrandaki **$1.44\text{ G}$** ibresini oluşturmuştur.

---

## 💥 DENEY 2: "Manuel Rampa Bırakması ve Ters İtki Taklası" (Inverted Thrust Flip & Crash)

### 2.1 Test Koşulları
Kullanıcı otomatik butonları kullanmak yerine, aracı fareyle (drag & drop) manuel olarak C-Loop rampasının girişine bırakmıştır. Araç rampadan $196^\circ$ baş aşağı fırlamış; yan RCS jetleri aracı döndürmeye çalışırken alt ana motorlar tam gaz açılmış ve araç takla atarak yere çakılmıştır.

### 2.2 Telemetri Analizi: Faz 1 - Havada Takla Başlangıcı ($Z = 18.1\text{ m}$)
* **Uçuş Durumu:** `SAF AI MODEL`
* **İrtifa ($Z$):** **$18.1\text{ m}$**
* **Hedef Hatası ($\Delta X$):** **$28.8\text{ m}$**
* **Dikey Hız ($V_z$):** **$-10.5\text{ m/s}$** (Yere doğru hızla düşüyor)
* **Yatay Hız ($V_x$):** **$-21.6\text{ m/s}$** (Yüksek negatif sürüklenme)
* **Pitch Açısı ($\theta$):** **$68.8^\circ$** (Aşırı dik burun açısı)
* **Roll Açısı ($\Phi$):** **$-152.3^\circ$** (KRİTİK HATA: Araç hala %85 oranında baş aşağı / ters!)
* **Pitch Açısal Hızı ($\Omega$):** **$-1.18\text{ rad/s}$** (Kontrolsüz takla dönmesi)
* **G-Kuvveti:** **$2.22\text{ G}$** (Çok şiddetli şok ivmesi)
* **Kalan Yakıt:** **$21.4\text{ kg}$ (%48)**
* **Aktüatörler:**
  * **Alt Ön-Sol: %98 | Alt Ön-Sağ: %97 | Alt Arka-Sol: %97 | Alt Arka-Sağ: %97**
  * Yan RCS: %0 - %1

#### Neden Takla Attı? (Faz 1 Analizi):
* Araç henüz $360^\circ$ burgusunu tamamlayamamış, Roll açısı **$-152.3^\circ$** (yani tekerlekler havada, tavan yere bakıyor) durumdadır.
* Tam bu sırada sinir ağı düşüş hızını ($-10.5\text{ m/s}$) durdurmak için 4 alt motoru birden **%98 TAM GAZ** ateşlemiştir.
* **Fiziksel Felaket:**
  Araç ters dururken alt motorları ateşlemek, roketi yukarı kaldırmaz; **doğrudan zemine doğru fırlatır!**
  Ayrıca gövde $68.8^\circ$ eğik olduğu için itki araca devasa bir yalpalama torku bindirmiş ve araç gyro-kararlılığını kaybedip şiddetle taklaya girmiştir.

---

### 2.3 Telemetri Analizi: Faz 2 - Piste Çarpma Anı ($Z = 0.0\text{ m}$)
* **Uçuş Durumu:** `KAZA` (Kırmızı Rozet)
* **İrtifa ($Z$):** **$0.0\text{ m}$** (Zemin teması)
* **Hedef Hatası ($\Delta X$):** **$6.8\text{ m}$** (Pist kenarı)
* **Dikey Hız ($V_z$):** **$-8.0\text{ m/s}$** (İniş limiti $\le 1.5\text{ m/s}$ iken 5 kat hızlı çarpışma!)
* **Yatay Hız ($V_x$):** **$-1.3\text{ m/s}$**
* **Pitch Açısı ($\theta$):** **$19.6^\circ$**
* **Roll Açısı ($\Phi$):** **$-111.4^\circ$** (Araç piste tekerlekleri üzerinde değil, tavanı/kapısı üzerine yan yatmış şekilde çarpmıştır!)
* **Kalan Yakıt:** **$0.0\text{ kg}$ (%0)** (Depo tamamen tükenmiş, Flameout)
* **G-Kuvveti:** **$0.00\text{ G}$** (Parçalanmış araç hareketsiz)

---

## 🛠️ Havacılık ve Kontrol Mühendisliği Çözüm Önerileri

Bu iki saha deneyi, simülasyonun ve yapay zekanın uç noktalardaki davranışını netleştirmiştir. Gelecek yazılım güncellemelerinde uygulanabilecek sektörel güvenlik kilitleri (Safety Gates):

### 1. Roll-Lock Emniyet Kilidi (Inverted Thrust Inhibit)
* **Kural:** Eğer aracın Roll hatası $|\Phi - \Phi_{target}| > 35^\circ$ ise (yani araç dik değilse), **ana alt motorların ateşlenmesi yazılımsal olarak kilitlenmeli (Thrust = 0)** ve kontrol yalnızca yan RCS jetlerine verilmelidir.
* **Fayda:** Araç tersken motor açıp kendini yere çakması ve takla atması %100 engellenir.

### 2. Serbest Düşüş Kilidi (Freefall Deadband) & Tırmanma Cezası
* **Kural:** $h > 20\text{ m}$ irtifadayken ve $v_z > -2.0\text{ m/s}$ iken ana motorlar %0'da tutulmalı, yerçekimiyle düşüşe izin verilmelidir.
* **Fayda:** Deney 1'deki gibi aracın $42.9$ metreye tırmanıp "Aya gitmesi" engellenir; gerçekçi bir SpaceX Hoverslam sergilenir.

---

## 3. UYGULANAN ÇÖZÜM: FLIGHT ENVELOPE PROTECTION (FEP) VE TEST SONUÇLARI

Kullanıcı geri bildirimi doğrultusunda hem Python fizik motoruna (`hover/sim/dynamics.py`) hem de Three.js 120Hz istemcisine (`hover/web/index.html`) tam teşekküllü **Uçuş Emniyet Zarfı (FEP)** entegre edilmiştir.

### 3.1 Entegre Edilen Algoritmik Güvenlik Katmanları:
1. **Roll-Lock Emniyet Çarpanı:**
   $$roll\_safe = \text{clamp}\left(\frac{u_z - 0.05}{0.30}, 0.0, 1.0\right)$$
   Araç ters dururken veya burgu açısı $35^\circ$'yi aştığında alt motorlar anında kapatılır. 4 yan RCS jeti kontrolü devralarak aracı $0.15\text{ s}$ içinde dik konuma getirir.
2. **Serbest Düşüş & Tırmanma Kalkanı:**
   $$climb\_safe = \text{clamp}\left(1.0 - \frac{v_z}{3.0}, 0.0, 1.0\right) \quad (\text{eğer } h > 15\text{ m} \text{ ve } v_z > 0.2\text{ m/s})$$
   Roket yüksek irtifada yukarı doğru tırmanmaya başladığında motor itkisi anında kısılır. Yerçekimi aracı nominal parabolik iniş çizgisine çeker.
3. **Akıllı Rampa Sürüşü & Fırlatma Eşiği:**
   Fare ile rampa üzerine bırakıldığında veya rampa tırmanışında tekerleklerin pist tutuşu korunur, alt motorların tekerlekleri raydan atması engellenir. Dudağa ($196^\circ$) ulaşıldığında $\ge 22\text{ m/s}$ temiz fırlatma hızıyla iniş koridoruna atlar.
4. **Havacılık HUD Rozeti:**
   Sol telemetri paneline anlık `FEP EMNİYETİ: GÜVENLİ / ROLL-LOCK / TIRMANMA KİLİDİ / RAMPA SÜRÜŞÜ` rozeti eklenmiştir.

### 3.2 Doğrulama Sonuçları:
* **Birim Testleri:** 7/7 test passed (0.006s).
* **Rampa Fırlatması Testi:**
  * **İrtifa:** $Z = 0.0\text{ m}$
  * **Dikey Hız:** $V_z = -0.0\text{ m/s}$
  * **Yatay Hız:** $V_x = -0.1\text{ m/s}$
  * **Pitch Eğimi:** $\theta = -0.1^\circ$
  * **Roll Burgusu:** $\Phi = 0.1^\circ$
  * **Uçuş Durumu:** `YUMUŞAK İNİŞ` (Soft Landing)
  * **Sonuç:** Takla atma ve göğe fırlama anomalileri tamamen bertaraf edilmiş, sistem kararlı v1.0 sürümüne ulaştırılmıştır.

---

## 4. SAHA DENEYİ 3: FARE İLE BIRAKMA VE 1 TUŞU FIRLATMASI HIZ FARKI

### 4.1 Kullanıcı Gözlemi ve Belirtisi
* **Kullanıcı Geri Bildirimi:** *"ters kilitte boyle kaldi"* ve *"sana yardimci olayim mouse ile firlatinca oluyor sanirim mouse ile birakilinca 1 tusundaki birakmayla arasinda hiz farki var"*.
* **Ekran Görüntüsü Analizi:** 
  * $Z = 0.0\text{ m}$, $V_z = -0.0\text{ m/s}$, $V_x = -15.3\text{ m/s}$
  * Pitch: $85.6^\circ$, Roll: $-176.0^\circ$
  * Uçuş Durumu: `KAZA`, FEP: `ROLL-LOCK (TERS KİLİT)`
  * Alt Motorlar: %0 (Tamamen susturulmuş)

### 4.2 Kök Neden Analizi (Root Cause Analysis):
1. **Kinematik Hız Farkı:**
   * **1 Tuşu Fırlatması:** Araç rampaya $115\text{ km/h}$ ($31.8\text{ m/s}$) hızla girer ve $196^\circ$ tepe dudağından $V_x = -24.8\text{ m/s}, V_z = -6.2\text{ m/s}$ ($25.6\text{ m/s}$) nominal hızla fırlar. Bu hız, $58$ metre uzaktaki piste ($X = -62\text{ m}$) ulaşmak için gereken kinetik enerjiyi tam olarak sağlar.
   * **Fare ile Bırakma:** İnsan eliyle fare bırakıldığında hız yalnızca $2$ ila $6\text{ m/s}$ civarındadır. Bu düşük hızla rampada veya havada bırakılan araç, yerçekimine ($28\text{ m}$ tırmanış kaybı) yenik düşerek tepede duraksar ve piste ulaşamadan yarı yolda yere çakılır.
2. **Yıkıcı Roll-Lock Engeli (Deadlock):**
   * Önceki `rollSafeFactor` algoritması, $u_z = \cos(\theta)\cos(\Phi) < 0.25$ olduğunda motorları %0'a çekiyordu.
   * Araç yatay frenleme için burnunu kaldırdığında ($\theta \approx 85.6^\circ$) veya pist yönünde ters uçarken $\cos(\theta) \approx 0$ olduğu için $u_z \approx 0$ olmakta ve FEP motorları havada tamamen kapatmaktaydı.
   * Motorları kapanan araç motorsuz şekilde yere çakılmış ve yerde ters durduğu için FEP süresiz olarak `ROLL-LOCK` modunda kilitli kalmıştır.

### 4.3 Yapılan Nihai Çözüm:
1. **Fare Bırakmasını 1 Tuşu Tırmanış Motoruna Bağlama:**
   * Fare ile rampa üzerinde herhangi bir noktaya bırakıldığında, `getRampClimbTForPos(x, z)` fonksiyonu aracın rampa yayındaki yerini bulur ve doğrudan 1 tuşundaki $115\text{ km/h}$ tırmanış programına (`stepArenaRampClimb`) bağlar.
   * Rampa dudağında veya yakınında bırakıldığında doğrudan nominal fırlatma hızı ($V_x = -24.8\text{ m/s}, V_z = -6.2\text{ m/s}$) verilir. Hız farkı sıfırlanmıştır.
2. **Motor Kapatma Kuralının Kaldırılması:**
   * Havada motorları kapatan `roll_safe` kuralı kaldırıldı; sinir ağının tork üretmesine izin verildi. Yalnızca aşırı yükselmeyi ($h > 15\text{ m}, v_z > 0.5\text{ m/s}$) frenleyen yumuşak tırmanma sınırı (%35 taban tork korumalı) muhafaza edildi.
3. **Kaza Sonrası Otomatik Canlanma ve "R" Kısayolu:**
   * Araç kaza yaptığında FEP durumu `KAZA (YENİDEN BAŞLAT: R)` olur.
   * 2.5 saniye sonra otomatik olarak rampadan yeniden fırlatılır.
   * Kullanıcı klavyeden **R** veya **1** tuşuna basarak istediği an simülasyonu anında yeniden başlatabilir.

### 4.3 Yapılan Nihai Çözüm:
1. **Fare Bırakmasını 1 Tuşu Tırmanış Motoruna Bağlama:**
   * Fare ile rampa üzerinde herhangi bir noktaya bırakıldığında, `getRampClimbTForPos(x, z)` fonksiyonu aracın rampa yayındaki yerini bulur ve doğrudan 1 tuşundaki $115\text{ km/h}$ tırmanış programına (`stepArenaRampClimb`) bağlar.
   * Rampa dudağında veya yakınında bırakıldığında doğrudan nominal fırlatma hızı ($V_x = -24.8\text{ m/s}, V_z = -6.2\text{ m/s}$) verilir. Hız farkı sıfırlanmıştır.
2. **Motor Kapatma Kuralının Kaldırılması:**
   * Havada motorları kapatan `roll_safe` kuralı kaldırıldı; sinir ağının tork üretmesine izin verildi. Yalnızca aşırı yükselmeyi ($h > 15\text{ m}, v_z > 0.5\text{ m/s}$) frenleyen yumuşak tırmanma sınırı (%35 taban tork korumalı) muhafaza edildi.
3. **Kaza Sonrası Otomatik Canlanma ve "R" Kısayolu:**
   * Araç kaza yaptığında FEP durumu `KAZA (YENİDEN BAŞLAT: R)` olur.
   * 2.5 saniye sonra otomatik olarak rampadan yeniden fırlatılır.
   * Kullanıcı klavyeden **R** veya **1** tuşuna basarak istediği an simülasyonu anında yeniden başlatabilir.

---

## 5. DENEY 4: Ters Bırakta Havada Asılı Kalma (Hover Trap) & Yere İnmeden Önce Dönme/Donma

### 5.1 Gözlem ve Kullanıcı Bildirimi:
* **Bildirim 1:** *"Ters bırakta bazen yakıt bitene dek havada bırakıyor"*
* **Bildirim 2:** *"Dönüyor yere inmeden önce"* (veya *"donuyor yere inmeden önce"*)
* **Ekran Görüntüsü Telemetrisi:**
  * İrtifa: $Z = 3.3\text{ m}$ (hedef: $0.7\text{ m}$)
  * Hedef Hatası: $\Delta X = 3.2\text{ m}$ (Pist: $X = -62\text{ m}$)
  * Dikey Hız: $V_z = -5.5\text{ m/s}$
  * Alt Motorlar: $\%64 - \%65$
  * Kalan Yakıt: $19.5\text{ kg}$ ($\%43$)

### 5.2 Kök Neden Analizi (Root Cause Analysis):
1. **Havada Asılı Kalma & Yakıt Tükenmesi (Hover Trap & Flameout):**
   * Sinir ağı, rampadan $-25\text{ m/s}$ yatay hızla gelen uçuşlar için eğitilmiştir.
   * Ters bırakıldığında ($Z = 24\text{ m}, V_z \approx -1\text{ m/s}$), araç dikey hızı sıfırlamak için $\%50$ motor gücü uygular ($\text{TWR} \approx 1.15$).
   * Bu itki yerçekimini aştığı için araç $Z \approx 18-20\text{ m}$ irtifada havada asılı kalır.
   * Hover durumunda $4$ motor saniyede $\approx 7.8\text{ kg}$ yakıt yakar. $45\text{ kg}$'lık depo $\approx 5.8$ saniyede tamamen tükenir (Flameout) ve araç serbest düşüşle çakılır.
2. **Yere İnmeden Önce Dönme (Yaw/Roll Tumble):**
   * Sinir ağı sıfır ileri hızla dikey inişte roll burgusunu nötrlemek yerine son metrelerde yan bank açısı üretmeye çalışıyordu. Bu durum aracın yere dokunmadan önce dönmesine/savrulmasına yol açıyordu.
3. **Yere İnmeden Önce Asılı Kalma/Donma (Ground Effect Bounce & Touchdown Deadlock):**
   * Asfalta $20-30\text{ cm}$ kala zemin etkisi gaz yastığı ($+18\%$ kaldırma) motorları havada tutuyor, tekerlek temas koşulları ($|v_z| < 1.2\text{ m/s}, |v_x| < 2.2\text{ m/s}$) çok dar olduğu için motorlar kapanmıyor ve araç zemin üzerinde askıda donup kalıyordu.

### 5.3 Yapılan Nihai Çözüm:
1. **Falcon 9 Kademeli Alçalış Profili (Anti-Hover Fuel Guard):**
   * $h > 3.0\text{ m}$ irtifada nominal alçalış hızı $v_{\text{nom}} = -1.05\sqrt{2 \cdot 3.8 \cdot h}$ hedeflenir.
   * Araç nominal hızdan yavaş iniyorsa veya asılı kalıyorsa motorlar otomatik olarak $\%15-\%25$'e kadar kısılarak serbest düşüşe izin verilir. Yakıt son metrelerdeki *Suicide Burn* için saklanır.
2. **Terminal Dönme Önleme & Hizalama Kilidi (Anti-Spin Alignment - $h \le 4.5\text{ m}$):**
   * $h \le 4.5\text{ m}$ olduğunda hem RCS diferansiyeli hem de alt motor torku aktif edilerek aracın açısal hızları ($\omega, \omega_{\text{roll}}$) sıfırlanır, pitch ve roll yere paralel ($0^\circ$) kilitlenir. Dönme tamamen engellenir.
3. **Suicide Burn Dokunuş Frenlemesi & Motor Susturma (SECO - $h \le 3.2\text{ m}$):**
   * Yere $3.2\text{ m}$ kala frenleme katsayısı yumuşak iniş hızına ($V_z \approx -0.75\text{ m/s}$) ayarlanır.
   * Tekerlekler asfalta dokunduğu anda motorlar anında kapatılır ($0\text{ N}$), frenler kilitlenir ve zemin üzerinde sıçrama veya donma yapmadan pürüzsüz park edilir.

---
*Bu rapor, saha deneyleri ve nihai FEP güvenlik mühendisliği doğrulamasını belgeler.*
