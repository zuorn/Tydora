use std::collections::HashSet;
use std::sync::OnceLock;
use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use serde::Deserialize;

static AD_DOMAINS: OnceLock<HashSet<&'static str>> = OnceLock::new();

fn get_ad_domains() -> &'static HashSet<&'static str> {
    AD_DOMAINS.get_or_init(|| {
        let mut s = HashSet::new();
        // Google Ads
        s.insert("pagead2.googlesyndication.com");
        s.insert("adservice.google.com");
        s.insert("googleadservices.com");
        s.insert("www.googleadservices.com");
        s.insert("tpc.googlesyndication.com");
        s.insert("ads.google.com");
        s.insert("ad.doubleclick.net");
        s.insert("adclick.g.doubleclick.net");
        s.insert("stats.g.doubleclick.net");
        // Other ad networks
        s.insert("adnxs.com");
        s.insert("ads.twitter.com");
        s.insert("analytics.twitter.com");
        s.insert("ads.linkedin.com");
        s.insert("static.criteo.net");
        s.insert("cdn.taboola.com");
        s.insert("cdn.outbrain.com");
        s.insert("widgets.outbrain.com");
        s.insert("zergnet.com");
        s.insert("amazon-adsystem.com");
        s.insert("media.net");
        s.insert("contextual.media.net");
        s.insert("serving-sys.com");
        s.insert("ad.sxp.smartclip.net");
        s.insert("adn.ebay.com");
        s.insert("advertising.com");
        s.insert("advertising.yahoo.com");
        s.insert("ad.broadstreetads.com");
        s.insert("ads.betweendigital.com");
        s.insert("adsrvr.org");
        s.insert("ad.turn.com");
        s.insert("adsatt.espn.com");
        s.insert("ad.yieldlab.net");
        s.insert("adfox.yandex.ru");
        s.insert("admanmedia.com");
        s.insert("adskeeper.co.uk");
        s.insert("adsrv.eacdn.com");
        s.insert("adsyst.ru");
        s.insert("adternal.com");
        s.insert("adverline.com");
        s.insert("advertising-a.com");
        s.insert("advertisingbox.com");
        s.insert("adverline.com");
        s.insert("adwise.agency");
        s.insert("banners.iggy.com");
        s.insert("cdn-vzn.d3.sc");
        s.insert("clarityad.co");
        s.insert("crwdcntrl.net");
        s.insert("cuelinks.com");
        s.insert("doubleclick.net");
        s.insert("dsnextgen.com");
        s.insert("e-planning.net");
        s.insert("exelator.com");
        s.insert("eyeota.net");
        s.insert("flashtalking.com");
        s.insert("freewheel.com");
        s.insert("fyber.com");
        s.insert("gemius.pl");
        s.insert("gumgum.com");
        s.insert("harvestadsgrp.com");
        s.insert("heias.com");
        s.insert("hotjar.com");
        s.insert("iasds01.com");
        s.insert("indexww.com");
        s.insert("innovid.com");
        s.insert("instinctive.io");
        s.insert("jivox.com");
        s.insert("juicyads.com");
        s.insert("lijit.com");
        s.insert("loopme.com");
        s.insert("mathtag.com");
        s.insert("mgid.com");
        s.insert("moatads.com");
        s.insert("moat.com");
        s.insert("nativo.com");
        s.insert("nend.net");
        s.insert("openx.net");
        s.insert("optimizely.com");
        s.insert("permutive.com");
        s.insert("plista.com");
        s.insert("popads.net");
        s.insert("popcash.net");
        s.insert("pubmatic.com");
        s.insert("quantserve.com");
        s.insert("revjet.com");
        s.insert("rhythmone.com");
        s.insert("rubiconproject.com");
        s.insert("sharethrough.com");
        s.insert("smartadserver.com");
        s.insert("spotxchange.com");
        s.insert("stickyadstv.com");
        s.insert("teads.tv");
        s.insert("tribalfusion.com");
        s.insert("turn.com");
        s.insert("videeotv.com");
        s.insert("yieldmo.com");
        s.insert("zedo.com");
        // Chinese ad networks
        s.insert("cpro.baidu.com");
        s.insert("drmcmm.baidu.com");
        s.insert("hmcdn.baidu.com");
        s.insert("pos.baidu.com");
        s.insert("cb.baidu.com");
        s.insert("nsclick.baidu.com");
        s.insert("as.sinajs.com");
        s.insert("s.union.360.cn");
        s.insert("ssl-lazy.360.cn");
        s.insert("cpc.finasunce.com");
        s.insert("drmcmm.com");
        s.insert("ssp.1rtb.com");
        s.insert("cdn.adfuture.com");
        s.insert("adsmogo.com");
        s.insert("adsage.cn");
        s.insert("adsage.com");
        s.insert("adwo.com");
        s.insert("mopub.com");
        s.insert("inmobi.com");
        s.insert("vungle.com");
        s.insert("startapp.com");
        s.insert("chartboost.com");
        s.insert("applovin.com");
        s.insert("unity3d.com");
        // Tracking / analytics (often used for ad targeting)
        s.insert("hotjar.com");
        s.insert("mouseflow.com");
        s.insert("crazyegg.com");
        s.insert("luckyorange.com");
        s.insert("inspectlet.com");
        s.insert("clicktale.com");
        s.insert("fullstory.com");
        s.insert("segment.io");
        s.insert("segment.com");
        s.insert("amplitude.com");
        s.insert("mixpanel.com");
        s.insert("amplitude.com");
        // Common ad script patterns (partial domains)
        s.insert("ad.");
        s.insert("ads.");
        s.insert("ads2.");
        s.insert("adserver.");
        s.insert("tracking.");
        s.insert("analytics.");
        s
    })
}

fn is_ad_domain(host: &str) -> bool {
    let domains = get_ad_domains();
    let host_lower = host.to_lowercase();

    // Exact match
    if domains.contains(host_lower.as_str()) {
        return true;
    }

    // Check if it's a subdomain of an ad domain
    for domain in domains.iter() {
        if domain.starts_with('.') {
            if host_lower.ends_with(domain) {
                return true;
            }
        } else if host_lower == format!("ad.{}", domain)
            || host_lower == format!("ads.{}", domain)
            || host_lower == format!("tracking.{}", domain)
            || host_lower == format!("analytics.{}", domain)
        {
            return true;
        }
    }

    false
}

fn is_ad_url(url: &str) -> bool {
    let url_lower = url.to_lowercase();

    // Check for common ad URL patterns
    let ad_patterns = [
        "/ads/", "/ad/", "/advert/", "/advertisement/",
        "/banner/", "/banners/", "/popup/", "/popunder/",
        "/tracking/", "/beacon/", "/pixel.", "/pixel?",
        "doubleclick", "googlesyndication", "googleadservices",
        "adservice", "adserver", "adclick",
        "/adsense/", "/adwords/", "/analytics.js",
        "pagead", "pagead2",
    ];

    for pattern in &ad_patterns {
        if url_lower.contains(pattern) {
            return true;
        }
    }

    false
}

fn filter_html(html: &str) -> String {
    let mut result = html.to_string();

    // Remove ad-related script tags (by src domain)
    let script_patterns = [
        "googlesyndication",
        "googleadservices",
        "doubleclick.net",
        "pagead",
        "adservice",
        "ad.doubleclick",
        "adclick",
        "analytics.js",
        "gtag",
        "gtm.js",
        "hotjar.com",
        "mouseflow.com",
        "crazyegg.com",
        "luckyorange.com",
        "inspectlet.com",
        "clicktale.com",
        "fullstory.com",
        "segment.io",
        "mixpanel.com",
        "amplitude.com",
    ];

    for pattern in &script_patterns {
        // Remove <script src="...pattern...">...</script>
        while let Some(start) = result.find(&format!("<script")) {
            if let Some(tag_end) = result[start..].find('>') {
                let tag = &result[start..start + tag_end + 1];
                let tag_lower = tag.to_lowercase();
                if tag_lower.contains(pattern) {
                    // Find closing tag
                    if let Some(end) = result[start..].find("</script>") {
                        result = format!(
                            "{}{}",
                            &result[..start],
                            &result[start + end + 9..]
                        );
                    } else {
                        result = format!("{}{}", &result[..start], &result[start + tag_end + 1..]);
                    }
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }

    // Remove ad iframes
    let iframe_patterns = ["doubleclick", "googlesyndication", "adservice", "pagead"];
    for pattern in &iframe_patterns {
        while let Some(start) = result.find("<iframe") {
            if let Some(tag_end) = result[start..].find('>') {
                let tag = &result[start..start + tag_end + 1];
                let tag_lower = tag.to_lowercase();
                if tag_lower.contains(pattern) {
                    if let Some(end) = result[start..].find("</iframe>") {
                        result = format!(
                            "{}{}",
                            &result[..start],
                            &result[start + end + 9..]
                        );
                    } else {
                        result = format!("{}{}", &result[..start], &result[start + tag_end + 1..]);
                    }
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }

    // Inject ad-hiding CSS
    let ad_hide_css = r#"
<style id="tydora-adblock">
  [id*="google_ads"], [class*="google_ads"],
  [id*="ad-"], [class*="ad-banner"], [class*="ad-container"],
  [class*="advertisement"], [id*="advertisement"],
  [class*="adsbygoogle"], [id*="adsbygoogle"],
  [class*="sponsored"], [id*="sponsored"],
  [class*="promo"], [id*="promo-banner"],
  [data-ad], [data-ads], [data-ad-slot],
  .ad, .ads, .advert, .advertisement,
  .ad-wrapper, .ad-banner, .ad-container,
  .ad-slot, .ad-unit, .ad-block,
  .sidebar-ad, .footer-ad, .header-ad,
  .sticky-ad, .floating-ad, .popup-ad,
  .interstitial-ad, .overlay-ad,
  ins.adsbygoogle,
  div[id^="div-gpt-ad"],
  div[id^="google_ads_"],
  iframe[src*="doubleclick"],
  iframe[src*="googlesyndication"],
  iframe[src*="pagead"],
  iframe[src*="adservice"],
  .ytp-ad-overlay-container,
  .ytp-ad-text-overlay,
  .ytp-ad-image-overlay,
  .video-ads,
  .player-ad,
  #player_ads,
  .ad-container,
  .videoAdUi,
  .videoAdUiSlot,
  .videoAdUiOverlaySlot,
  .videoAdUiBreaking,
  .videoAdUiInstreamInfo,
  .videoAdUiAttribution,
  .videoAdUiTopLeft,
  .videoAdUiBottomBar,
  .videoAdUiPlayPauseButton,
  .videoAdUiMuteButton,
  .videoAdUiVolumeButton,
  .videoAdUiTimeDisplay,
  .videoAdUiDuration,
  .videoAdUiSkipButton,
  .videoAdUiSkipPreview,
  .videoAdUiSkipCountdown,
  .videoAdUiGoogima,
  .videoAdUiShim,
  .videoAdUiChaChing,
  .videoAdUiPreloader,
  .videoAdUiAttributionIcon,
  .videoAdUiVisitAdvertiserLink,
  .videoAdUiWatchLaterButton,
  .videoAdUiShareButton,
  .videoAdUiMoreInfoButton,
  .videoAdUiFeedbackButton,
  .videoAdUiSpeedUp,
  .videoAdUiCountdown,
  .videoAdUiProgressBar,
  .videoAdUiTopBar,
  .videoAdUiBottomLine,
  .videoAdUiBorder,
  .videoAdUiWatermark,
  .videoAdUiBranding,
  .videoAdUiCompanion,
  .videoAdUiCompanionSlot,
  .videoAdUiCompanionDiv,
  .videoAdUiCompanionImage,
  .videoAdUiCompanionTitle,
  .videoAdUiCompanionDescription,
  .videoAdUiCompanionLearnMore,
  .videoAdUiCompanionClose,
  .videoAdUiCompanionIcon,
  .videoAdUiCompanionBanner,
  .videoAdUiCompanionLink,
  .videoAdUiCompanionWrapper,
  .videoAdUiCompanionBackButton,
  .videoAdUiCompanionForwardButton,
  .videoAdUiCompanionReplayButton,
  .videoAdUiCompanionShareButton,
  .videoAdUiCompanionMoreInfoButton,
  .videoAdUiCompanionVisitAdvertiserButton,
  .videoAdUiCompanionLearnMoreButton,
  .videoAdUiCompanionCloseButton,
  .videoAdUiCompanionPauseButton,
  .videoAdUiCompanionMuteButton,
  .videoAdUiCompanionVolumeButton,
  .videoAdUiCompanionPlayButton,
  .videoAdUiCompanionStopButton,
  .videoAdUiCompanionReplayButtonSmall,
  .videoAdUiCompanionShareButtonSmall,
  .videoAdUiCompanionMoreInfoButtonSmall,
  .videoAdUiCompanionVisitAdvertiserButtonSmall,
  .videoAdUiCompanionLearnMoreButtonSmall,
  .videoAdUiCompanionCloseButtonSmall,
  .videoAdUiCompanionPauseButtonSmall,
  .videoAdUiCompanionMuteButtonSmall,
  .videoAdUiCompanionVolumeButtonSmall,
  .videoAdUiCompanionPlayButtonSmall,
  .videoAdUiCompanionStopButtonSmall,
  .adBlockDetect, .ad-block-detect,
  .adblock-overlay, .adblock-modal,
  [data-adblock], [class*="adblock"]
</style>
"#;

    // Inject before </head> or at the start of <body>
    if let Some(pos) = result.find("</head>") {
        result = format!("{}{}{}", &result[..pos], ad_hide_css, &result[pos..]);
    } else if let Some(pos) = result.find("<body") {
        result = format!("{}{}{}", &result[..pos], ad_hide_css, &result[pos..]);
    } else {
        result = format!("{}{}", ad_hide_css, result);
    }

    result
}

#[derive(Deserialize)]
pub struct ProxyQuery {
    pub url: String,
}

#[derive(Clone)]
pub struct ProxyState {
    pub client: reqwest::Client,
}

pub async fn proxy_handler(
    State(state): State<ProxyState>,
    Query(query): Query<ProxyQuery>,
) -> Result<Response, StatusCode> {
    let url = &query.url;

    // Validate URL
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Check if the main domain is an ad domain
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            if is_ad_domain(host) {
                return Err(StatusCode::FORBIDDEN);
            }
        }
    }

    // Fetch the page with proper headers
    let resp = match state
        .client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .header("Referer", url)
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return Err(StatusCode::BAD_GATEWAY),
    };

    let _status = resp.status();
    let headers = resp.headers().clone();
    let content_type = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    // Check if it's an ad URL
    if is_ad_url(url) {
        return Err(StatusCode::FORBIDDEN);
    }

    // For HTML responses, filter and modify
    if content_type.contains("text/html") || content_type.contains("application/xhtml") {
        let body = match resp.text().await {
            Ok(b) => b,
            Err(_) => return Err(StatusCode::BAD_GATEWAY),
        };

        let filtered = filter_html(&body);

        // Add base tag for relative URLs
        let base_url = url::Url::parse(url).ok();
        let base_tag = if let Some(base) = base_url {
            format!(
                "<base href=\"{}/\" target=\"_blank\">",
                base.origin().ascii_serialization()
            )
        } else {
            String::new()
        };

        let final_html = if filtered.contains("<head>") {
            filtered.replace("<head>", &format!("<head>{}", base_tag))
        } else if filtered.contains("<HEAD>") {
            filtered.replace("<HEAD>", &format!("<HEAD>{}", base_tag))
        } else {
            format!("<!DOCTYPE html><html><head>{}</head><body>{}</body></html>", base_tag, filtered)
        };

        let mut response_headers = HeaderMap::new();
        response_headers.insert("content-type", "text/html; charset=utf-8".parse().unwrap());
        response_headers.insert(
            "content-security-policy",
            "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data: blob:; font-src * data:;".parse().unwrap(),
        );

        Ok((response_headers, final_html).into_response())
    } else {
        // For non-HTML resources, pass through (but filter ad domains)
        if let Ok(parsed) = url::Url::parse(url) {
            if let Some(host) = parsed.host_str() {
                if is_ad_domain(host) {
                    return Err(StatusCode::FORBIDDEN);
                }
            }
        }

        let body = match resp.bytes().await {
            Ok(b) => b,
            Err(_) => return Err(StatusCode::BAD_GATEWAY),
        };

        let mut response_headers = HeaderMap::new();
        if let Some(ct) = headers.get("content-type") {
            response_headers.insert("content-type", ct.clone());
        }

        Ok((response_headers, body.to_vec()).into_response())
    }
}

pub fn create_proxy_router() -> Router<ProxyState> {
    Router::new()
        .route("/proxy", get(proxy_handler))
        .route("/proxy/*path", get(proxy_sub_handler))
}

async fn proxy_sub_handler(
    State(state): State<ProxyState>,
    axum::extract::RawQuery(raw_query): axum::extract::RawQuery,
    axum::extract::Path(path): axum::extract::Path<String>,
) -> Result<Response, StatusCode> {
    // The path is the full URL (e.g., "https://example.com/style.css")
    let query_str = raw_query.unwrap_or_default();
    let full_url = if query_str.is_empty() {
        path
    } else {
        format!("{}?{}", path, query_str)
    };

    // Forward to the main proxy handler
    let query = ProxyQuery { url: full_url };
    proxy_handler(State(state), Query(query)).await
}

#[tauri::command]
pub async fn start_proxy_server() -> Result<String, String> {
    use std::net::TcpListener;

    // Find an available port
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    drop(listener);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let state = ProxyState { client };
    let app = create_proxy_router().with_state(state);

    let addr = format!("127.0.0.1:{}", port);
    let addr_clone = addr.clone();

    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(&addr_clone)
            .await
            .expect("Failed to bind proxy server");
        axum::serve(listener, app)
            .await
            .expect("Proxy server failed");
    });

    // Wait briefly for the server to be ready
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Verify the server is reachable
    let check_url = format!("http://127.0.0.1:{}/", port);
    let client = reqwest::Client::new();
    let _ = client.get(&check_url).send().await;

    Ok(format!("http://127.0.0.1:{}", port))
}

#[tauri::command]
pub async fn fetch_page_title(url: String) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Invalid URL".into());
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let body = resp.text().await.map_err(|e| e.to_string())?;

    // Extract <title> from HTML
    if let Some(start) = body.to_lowercase().find("<title>") {
        let rest = &body[start + 7..];
        if let Some(end) = rest.to_lowercase().find("</title>") {
            let title = rest[..end].trim();
            if !title.is_empty() {
                return Ok(title.to_string());
            }
        }
    }

    // Fallback to hostname
    url::Url::parse(&url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .ok_or_else(|| "Failed to extract title".into())
}
