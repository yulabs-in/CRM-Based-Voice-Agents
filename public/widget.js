(function () {
  var script = document.currentScript;
  if (!script) return;

  var key = script.getAttribute("data-key") || "";
  var mode = script.getAttribute("data-mode") === "floating" ? "floating" : "inline";
  if (!key) return;

  var baseUrl = script.getAttribute("data-base-url") || "";
  if (!baseUrl && script.src) {
    try {
      baseUrl = new URL(script.src).origin;
    } catch (_) {
      baseUrl = window.location.origin;
    }
  }
  if (!baseUrl) baseUrl = window.location.origin;

  var configCache = {};

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderWidget(cfg) {
    var host = document.createElement("div");
    host.className = "yulabs-widget-host";
    var shadow = host.attachShadow({ mode: "open" });
    var colour = cfg.colour || "#6d28d9";
    var title = cfg.title || "Get a call back";
    var btnLabel = cfg.button || "Call me";
    var orgName = cfg.org_name || "our team";
    var callbackOn = Boolean(cfg.instant_callback);
    var privacyUrl = cfg.privacy_url || "";
    var renderedAt = Date.now();

    var style = document.createElement("style");
    style.textContent =
      ":host{all:initial;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827}" +
      ".wrap{box-sizing:border-box;width:100%;max-width:360px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:20px;box-shadow:0 12px 30px rgba(0,0,0,.08)}" +
      ".floating-wrap{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:10px}" +
      ".launcher{border:none;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:600;color:#fff;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18)}" +
      ".launcher:focus-visible,.submit:focus-visible,input:focus-visible{outline:2px solid " + escapeHtml(colour) + ";outline-offset:2px}" +
      "h3{margin:0 0 12px;font-size:17px;font-weight:700;line-height:1.3}" +
      ".field{margin-bottom:12px}" +
      "label{display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#374151}" +
      "input[type=text],input[type=tel]{box-sizing:border-box;width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;background:#fff;color:#111827}" +
      ".hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none}" +
      ".consent{display:flex;align-items:flex-start;gap:8px;margin:12px 0;font-size:12px;line-height:1.4;color:#4b5563}" +
      ".consent input{margin-top:2px;flex-shrink:0}" +
      ".consent a{color:" + escapeHtml(colour) + ";text-decoration:underline}" +
      ".submit{width:100%;border:none;border-radius:10px;padding:10px 14px;font-size:14px;font-weight:600;color:#fff;cursor:pointer;background:" + escapeHtml(colour) + "}" +
      ".submit[disabled]{opacity:.6;cursor:not-allowed}" +
      ".status{margin-top:10px;font-size:13px;line-height:1.4;min-height:18px}" +
      ".status.ok{color:#047857}" +
      ".status.err{color:#b91c1c}";

    var card = document.createElement("div");
    card.className = "wrap";
    card.innerHTML =
      "<h3>" + escapeHtml(title) + "</h3>" +
      '<form novalidate>' +
      '<div class="field"><label for="yl-name">Name *</label><input id="yl-name" name="name" type="text" required autocomplete="name" placeholder="Your name"></div>' +
      '<div class="field"><label for="yl-phone">Mobile number *</label><input id="yl-phone" name="phone" type="tel" required autocomplete="tel" placeholder="+91 98765 43210"></div>' +
      '<div class="field"><label for="yl-interest">Interest (optional)</label><input id="yl-interest" name="interest" type="text" placeholder="e.g. Health insurance"></div>' +
      '<div class="hp" aria-hidden="true"><label for="yl-hp">Company website</label><input id="yl-hp" name="company_website" type="text" tabindex="-1" autocomplete="off"></div>' +
      '<label class="consent"><input id="yl-consent" name="consent" type="checkbox"' + (callbackOn ? " required" : "") + '><span>I agree to receive a call from ' + escapeHtml(orgName) + ' about my enquiry.' +
      (privacyUrl ? ' <a href="' + escapeHtml(privacyUrl) + '" target="_blank" rel="noopener noreferrer">Privacy policy</a>' : "") +
      "</span></label>" +
      '<button type="submit" class="submit">' + escapeHtml(btnLabel) + "</button>" +
      '<div class="status" role="status" aria-live="polite"></div>' +
      "</form>";

    var form = card.querySelector("form");
    var submitBtn = card.querySelector(".submit");
    var statusEl = card.querySelector(".status");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.elements.name.value.trim();
      var phone = form.elements.phone.value.trim();
      var interest = form.elements.interest.value.trim();
      var consent = form.elements.consent.checked;
      var hp = form.elements.company_website.value;

      statusEl.className = "status";
      if (!name) {
        statusEl.className = "status err";
        statusEl.textContent = "Please enter your name.";
        form.elements.name.focus();
        return;
      }
      if (!phone) {
        statusEl.className = "status err";
        statusEl.textContent = "Please enter a valid mobile number.";
        form.elements.phone.focus();
        return;
      }
      if (callbackOn && !consent) {
        statusEl.className = "status err";
        statusEl.textContent = "Please tick the consent box for a callback.";
        form.elements.consent.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";

      fetch(baseUrl + "/api/public/widget-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: key,
          name: name,
          phone: phone,
          interest: interest || undefined,
          consent: consent,
          company_website: hp || undefined,
          renderedAt: renderedAt
        })
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            statusEl.className = "status err";
            statusEl.textContent = (result.data && result.data.error) || "Something went wrong. Please try again.";
            return;
          }
          statusEl.className = "status ok";
          statusEl.textContent =
            result.data && result.data.callback === "now"
              ? "Thanks! We'll call you shortly."
              : "Thanks! We'll be in touch.";
          form.reset();
        })
        .catch(function () {
          statusEl.className = "status err";
          statusEl.textContent = "Network error. Please try again.";
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = btnLabel;
        });
    });

    shadow.appendChild(style);

    if (mode === "floating") {
      var container = document.createElement("div");
      container.className = "floating-wrap";
      card.style.display = "none";
      var launcher = document.createElement("button");
      launcher.type = "button";
      launcher.className = "launcher";
      launcher.style.background = colour;
      launcher.textContent = title;
      launcher.setAttribute("aria-expanded", "false");
      launcher.addEventListener("click", function () {
        var open = card.style.display === "block";
        card.style.display = open ? "none" : "block";
        launcher.setAttribute("aria-expanded", open ? "false" : "true");
        if (!open) {
          var first = card.querySelector("#yl-name");
          if (first) first.focus();
        }
      });
      card.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") {
          card.style.display = "none";
          launcher.setAttribute("aria-expanded", "false");
          launcher.focus();
        }
      });
      container.appendChild(card);
      container.appendChild(launcher);
      shadow.appendChild(container);
      document.body.appendChild(host);
    } else {
      shadow.appendChild(card);
      script.parentNode.insertBefore(host, script.nextSibling);
    }
  }

  if (configCache[key]) {
    renderWidget(configCache[key]);
    return;
  }

  fetch(baseUrl + "/api/public/widget-config?key=" + encodeURIComponent(key))
    .then(function (res) {
      if (!res.ok) throw new Error("Widget unavailable");
      return res.json();
    })
    .then(function (cfg) {
      configCache[key] = cfg;
      renderWidget(cfg);
    })
    .catch(function () {
      // Fail silently on host page if widget key or origin is invalid.
    });
})();
