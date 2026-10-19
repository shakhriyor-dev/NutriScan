(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const socket = typeof io === "function" ? io() : null;
  const state = {
    reader: null,
    stream: null,
    scanning: false,
    isMobile: isMobileOrTablet(),
    sessionCode: null,
    desktopPaired: false,
    lastBarcode: "",
    lookupBusy: false,
    toastTimer: null
  };

  function isMobileOrTablet() {
    const ua = navigator.userAgent || "";
    const deviceUA = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
    const touchMac = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
    const narrow = window.matchMedia("(max-width: 900px)").matches;
    return deviceUA || touchMac || narrow;
  }

  function setFeedback(message, type = "") {
    $("feedbackText").textContent = message;
    $("scanFeedback").className = `scan-feedback ${type}`.trim();
    $("feedbackIcon");
  }

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function showResultState(text) { $("resultState").textContent = text; }

  function showLoading() {
    $("emptyResult").classList.add("hidden");
    $("productResult").classList.add("hidden");
    $("loadingResult").classList.remove("hidden");
    showResultState("QIDIRILMOQDA");
  }

  function showEmpty() {
    $("loadingResult").classList.add("hidden");
    $("productResult").classList.add("hidden");
    $("emptyResult").classList.remove("hidden");
    showResultState("KUTILMOQDA");
  }

  function hideCamera() {
    if (state.reader) {
      try { state.reader.reset(); } catch (_) {}
      state.reader = null;
    }
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    const video = $("cameraVideo");
    video.pause?.();
    video.srcObject = null;
    video.classList.remove("active");
    $("videoOverlay").classList.remove("active");
    $("cameraPlaceholder").classList.remove("hidden");
    $("startCamera").classList.remove("hidden");
    $("stopCamera").classList.add("hidden");
    state.scanning = false;
  }

  function showMobileMode() {
    $("cameraTab").classList.remove("hidden");
    $("manualTab").classList.remove("hidden");
    $("cameraControls").classList.remove("hidden");
    $("scannerTitle").textContent = "Shtrix-kodni skanerlang";
    $("modeBadge").textContent = "KAMERA";
    const pair = new URLSearchParams(location.search).get("pair");
    if (pair && socket) {
      state.sessionCode = pair;
      socket.emit("phone:join-session", { code: pair }, (result) => {
        if (result?.ok) {
          setFeedback("Kompyuterga ulandingiz. Endi shtrix-kodni skanerlang.", "success");
          toast("Kompyuterga muvaffaqiyatli ulandingiz");
        } else {
          setFeedback(result?.message || "Kompyuter sessiyasiga ulanib bo‘lmadi.", "error");
        }
      });
    } else {
      setFeedback("Telefon yoki planshet kamerasi bevosita shu qurilmada ishlaydi.");
    }
  }

  function showDesktopMode() {
    $("scannerTitle").textContent = "Telefonni ulang va skanerlang";
    $("modeBadge").textContent = "DESKTOP";
    $("cameraTab").classList.add("hidden");
    $("manualTab").classList.remove("hidden");
    $("manualTab").classList.add("active");
    $("manualTab").setAttribute("aria-selected", "true");
    $("cameraTab").classList.remove("active");
    $("cameraTab").setAttribute("aria-selected", "false");
    $("cameraStage").classList.add("hidden");
    $("cameraControls").classList.add("hidden");
    $("manualEntry").classList.remove("hidden");
    $("manualEntry").querySelector("label").textContent = "Mahsulot shtrix-kodi";
    $("manualEntry").querySelector(".field-hint").textContent = "Telefonni QR-kod orqali ulang yoki kodni shu yerga kiriting.";
    $("cameraTab").setAttribute("aria-hidden", "true");
    createDesktopSession();
  }

  function createPairingCard(url) {
    const stage = $("cameraStage");
    stage.classList.remove("hidden");
    stage.innerHTML = `
      <div class="pairing-card">
        <div class="pairing-qr" id="pairingQR"></div>
        <div class="pairing-info">
          <span class="product-found"><i></i> TELEFONNI ULASH</span>
          <strong>QR-kodni telefoningiz bilan skanerlang</strong>
          <p>Telefoningizda shu sahifa ochiladi. Kamera ruxsatini bering va mahsulot shtrix-kodini o‘qing.</p>
          <span class="pairing-state" id="pairingState"><i></i> Telefon kutilmoqda...</span>
        </div>
      </div>`;
    if (window.QRCode) {
      new QRCode($("pairingQR"), { text: url, width: 150, height: 150, colorDark: "#152014", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
    } else {
      $("pairingQR").textContent = url;
    }
  }

  function createDesktopSession() {
    if (!socket) {
      setFeedback("Telefonni ulash uchun serverdagi Socket.IO aloqasi kerak.", "error");
      return;
    }
    socket.emit("desktop:create-session", (result) => {
      if (!result?.ok) {
        setFeedback("Ulanish sessiyasini yaratib bo‘lmadi. Sahifani yangilang.", "error");
        return;
      }
      state.sessionCode = result.code;
      const url = new URL(location.href);
      url.search = "";
      url.searchParams.set("pair", result.code);
      createPairingCard(url.toString());
      setFeedback("QR-kodni telefon bilan skanerlang. Telefon va kompyuter internet yoki bir xil Wi-Fi orqali shu serverga kira olishi kerak.");
    });
  }

  async function startCamera() {
    if (state.scanning) return;
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      setFeedback("Kamera uchun HTTPS kerak. Saytni HTTPS manzili orqali oching.", "error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setFeedback("Bu brauzer kamerani qo‘llab-quvvatlamaydi. HTTPS yoki zamonaviy brauzerdan foydalaning.", "error");
      return;
    }
    if (!window.ZXingBrowser) {
      setFeedback("Shtrix-kod kutubxonasi yuklanmadi. Internet aloqasini tekshirib, sahifani yangilang.", "error");
      return;
    }
    try {
      setFeedback("Kamera ochilmoqda...");
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      const video = $("cameraVideo");
      video.srcObject = state.stream;
      await video.play();
      video.classList.add("active");
      $("cameraPlaceholder").classList.add("hidden");
      $("videoOverlay").classList.add("active");
      $("startCamera").classList.add("hidden");
      $("stopCamera").classList.remove("hidden");
      state.scanning = true;
      const reader = new ZXingBrowser.BrowserMultiFormatReader();
      state.reader = reader;
      setFeedback("Kamera faol. Shtrix-kodni ramka ichida tuting.", "success");
      reader.decodeFromVideoElement(video, (result, error) => {
        if (!result || !state.scanning) return;
        const code = result.getText();
        if (!/^\d{8,14}$/.test(code)) {
          setFeedback("Kod o‘qildi, ammo bu EAN/UPC turidagi shtrix-kodga o‘xshamaydi.", "error");
          return;
        }
        if (code === state.lastBarcode) return;
        state.lastBarcode = code;
        if (!state.isMobile && state.sessionCode && socket) {
          socket.emit("phone:barcode", { code: state.sessionCode, barcode: code });
        }
        hideCamera();
        lookupProduct(code);
      });
    } catch (error) {
      hideCamera();
      const message = error?.name === "NotAllowedError"
        ? "Kameraga ruxsat berilmadi. Brauzer sozlamalaridan kamera ruxsatini bering."
        : error?.name === "NotFoundError"
          ? "Qurilmada kamera topilmadi."
          : "Kamerani ochib bo‘lmadi. HTTPS, brauzer ruxsati va kamera band emasligini tekshiring.";
      setFeedback(message, "error");
    }
  }

  async function lookupProduct(rawCode) {
    const barcode = String(rawCode || "").trim();
    if (!/^\d{8,14}$/.test(barcode)) {
      setFeedback("Shtrix-kod 8–14 ta raqamdan iborat bo‘lishi kerak.", "error");
      $("barcodeInput").focus();
      return;
    }
    if (state.lookupBusy) return;
    state.lookupBusy = true;
    $("barcodeInput").value = barcode;
    showLoading();
    setFeedback(`${barcode} kodi bo‘yicha mahsulot qidirilmoqda...`);
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`, {
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) throw new Error("API javob bermadi. Keyinroq qayta urinib ko‘ring.");
      const data = await response.json();
      if (data.status !== 1 || !data.product) {
        showEmpty();
        setFeedback("Bu shtrix-kod bo‘yicha mahsulot topilmadi. Kodni tekshiring yoki boshqa mahsulotni sinab ko‘ring.", "error");
        showResultState("TOPILMADI");
        toast("Mahsulot bazadan topilmadi");
        return;
      }
      renderProduct(data.product, barcode);
      addHistory(data.product, barcode);
      setFeedback("Mahsulot ma’lumotlari muvaffaqiyatli yuklandi.", "success");
      toast("Mahsulot topildi");
    } catch (error) {
      showEmpty();
      setFeedback(error.message || "Mahsulot ma’lumotlarini olishda xatolik yuz berdi.", "error");
      showResultState("XATOLIK");
    } finally {
      state.lookupBusy = false;
    }
  }

  function numberOrDash(value, suffix = "") {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "—";
    const num = Number(value);
    return `${Number(num.toFixed(2))}${suffix}`;
  }

  function nutrient(n, keys) {
    for (const key of keys) {
      const val = n?.[key];
      if (val !== null && val !== undefined && val !== "" && Number.isFinite(Number(val))) return Number(val);
    }
    return null;
  }

  function renderProduct(product, barcode) {
    $("emptyResult").classList.add("hidden");
    $("loadingResult").classList.add("hidden");
    $("productResult").classList.remove("hidden");
    showResultState("TAYYOR");
    const n = product.nutriments || {};
    const name = product.product_name || product.product_name_en || "Nomi kiritilmagan mahsulot";
    $("productName").textContent = name;
    $("productBrand").textContent = product.brands || product.categories || "Brend ko‘rsatilmagan";
    $("productBarcode").textContent = `EAN / UPC · ${barcode}`;
    const imageUrl = product.image_front_url || product.image_url || "";
    const img = $("productImage");
    const fallback = $("productImageFallback");
    if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
      img.src = imageUrl;
      img.alt = name;
      img.classList.remove("hidden");
      fallback.classList.add("hidden");
      img.onerror = () => { img.classList.add("hidden"); fallback.classList.remove("hidden"); };
    } else {
      img.removeAttribute("src");
      img.classList.add("hidden");
      fallback.classList.remove("hidden");
    }

    const calories = nutrient(n, ["energy-kcal_100g"]);
    const energyKj = nutrient(n, ["energy_100g"]);
    const kcal = calories !== null ? calories : (energyKj !== null ? energyKj / 4.184 : null);
    $("caloriesValue").textContent = kcal === null ? "—" : numberOrDash(kcal);
    const values = [
      ["proteinValue", "proteinBar", nutrient(n, ["proteins_100g"])],
      ["fatValue", "fatBar", nutrient(n, ["fat_100g"])],
      ["carbsValue", "carbsBar", nutrient(n, ["carbohydrates_100g"])],
      ["fiberValue", "fiberBar", nutrient(n, ["fiber_100g"])]
    ];
    values.forEach(([valueId, barId, value]) => {
      $(valueId).textContent = numberOrDash(value);
      $(barId).style.width = value === null ? "0%" : `${Math.min(100, Math.max(0, value))}%`;
    });
    $("saturatedValue").textContent = numberOrDash(nutrient(n, ["saturated-fat_100g"]), " g");
    $("sugarValue").textContent = numberOrDash(nutrient(n, ["sugars_100g"]), " g");
    $("saltValue").textContent = numberOrDash(nutrient(n, ["salt_100g"]), " g");
    $("quantityValue").textContent = product.quantity || "—";
    const ingredients = product.ingredients_text || product.ingredients_text_en || product.ingredients_text_uz || "";
    $("ingredientsValue").textContent = ingredients.trim() || "Ma’lumot mavjud emas.";
    $("nutritionNote").textContent = " Qiymatlar ishlab chiqaruvchi yoki hamjamiyat kiritgan ma’lumotlarga bog‘liq; qadoqdagi yorliqni ham tekshiring.";
  }

  function readHistory() {
    try { return JSON.parse(localStorage.getItem("nutriscan-history") || "[]"); }
    catch (_) { return []; }
  }

  function addHistory(product, barcode) {
    const history = readHistory().filter((item) => item.barcode !== barcode);
    history.unshift({
      barcode,
      name: product.product_name || product.product_name_en || "Nomi kiritilmagan mahsulot",
      image: product.image_front_small_url || product.image_front_url || "",
      calories: product.nutriments?.["energy-kcal_100g"] ?? null,
      time: Date.now()
    });
    try { localStorage.setItem("nutriscan-history", JSON.stringify(history.slice(0, 9))); } catch (_) {}
    renderHistory();
  }

  function renderHistory() {
    const list = $("historyList");
    const history = readHistory();
    if (!history.length) {
      list.innerHTML = '<div class="history-empty"><span>◷</span> Skanerlagan mahsulotlaringiz shu yerda saqlanadi.</div>';
      return;
    }
    list.innerHTML = "";
    history.slice(0, 6).forEach((item) => {
      const card = document.createElement("div");
      card.className = "history-item";
      const thumb = document.createElement("div");
      thumb.className = "history-thumb";
      if (item.image && /^https?:\/\//i.test(item.image)) {
        const image = document.createElement("img");
        image.src = item.image;
        image.alt = "";
        image.onerror = () => { thumb.textContent = "✳"; };
        thumb.appendChild(image);
      } else thumb.textContent = "✳";
      const meta = document.createElement("div");
      meta.className = "history-meta";
      const name = document.createElement("strong");
      name.textContent = item.name;
      const barcode = document.createElement("span");
      barcode.textContent = item.barcode;
      meta.append(name, barcode);
      const calories = document.createElement("div");
      calories.className = "history-calories";
      calories.textContent = item.calories === null ? "—" : numberOrDash(item.calories);
      const unit = document.createElement("small");
      unit.textContent = " kcal";
      calories.appendChild(unit);
      card.append(thumb, meta, calories);
      card.addEventListener("click", () => lookupProduct(item.barcode));
      card.style.cursor = "pointer";
      card.title = "Mahsulotni qayta ko‘rish";
      list.appendChild(card);
    });
  }

  function setMode(mode) {
    const camera = mode === "camera";
    $("cameraTab").classList.toggle("active", camera);
    $("manualTab").classList.toggle("active", !camera);
    $("cameraTab").setAttribute("aria-selected", String(camera));
    $("manualTab").setAttribute("aria-selected", String(!camera));
    // Desktop pairing QR must stay visible even while manual barcode entry is selected.
    if (state.isMobile) {
      $("cameraStage").classList.toggle("hidden", !camera);
      $("cameraControls").classList.toggle("hidden", !camera);
    }
    $("manualEntry").classList.toggle("hidden", camera);
  }

  $("startCamera").addEventListener("click", startCamera);
  $("stopCamera").addEventListener("click", () => {
    hideCamera();
    setFeedback("Kamera to‘xtatildi. Davom etish uchun kamerani qayta oching.");
  });
  $("cameraTab").addEventListener("click", () => setMode("camera"));
  $("manualTab").addEventListener("click", () => setMode("manual"));
  $("lookupButton").addEventListener("click", () => lookupProduct($("barcodeInput").value));
  $("barcodeInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") lookupProduct($("barcodeInput").value);
  });
  $("barcodeInput").addEventListener("input", () => {
    $("barcodeInput").value = $("barcodeInput").value.replace(/\D/g, "").slice(0, 14);
  });
  $("clearHistory").addEventListener("click", () => {
    try { localStorage.removeItem("nutriscan-history"); } catch (_) {}
    renderHistory();
    toast("Skanerlash tarixi tozalandi");
  });
  $("themeToggle").addEventListener("click", () => {
    const light = document.documentElement.classList.toggle("light");
    try { localStorage.setItem("nutriscan-theme", light ? "light" : "dark"); } catch (_) {}
  });

  if (socket) {
    socket.on("product:barcode", ({ barcode } = {}) => {
      if (barcode) lookupProduct(barcode);
    });
    socket.on("phone:connected", () => {
      const status = $("pairingState");
      if (status) status.innerHTML = "<i></i> Telefon ulandi";
      setFeedback("Telefon ulandi. Endi telefon kamerasi orqali shtrix-kodni skanerlang.", "success");
      toast("Telefon ulandi");
    });
    socket.on("session:closed", () => {
      setFeedback("Kompyuterdagi ulanish sessiyasi yopildi. Sahifani yangilang va qayta ulang.", "error");
    });
  }

  try {
    if (localStorage.getItem("nutriscan-theme") === "light") document.documentElement.classList.add("light");
  } catch (_) {}

  if (state.isMobile) showMobileMode();
  else showDesktopMode();
  renderHistory();

  // Avoid keeping the camera active when the user leaves the page.
  window.addEventListener("pagehide", hideCamera);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.scanning) hideCamera();
  });
})();