chrome.webRequest.onBeforeRequest.addListener(function(d){
  // neat way to extract domain name from url
  var domain = new URL(d.url).hostname;
  var url = d.url;
  var hash = "asdfhaskdfasdf/=";  // TODO: Think of a good way to get hash from page to send it to server so the server can compare what it fetches vs what client fetch
  var wbl = {};
  var toCheck = "https://localhost:8080/wbl?hostname="+domain+"&url="+url+"&hash="+hash;
  console.log(toCheck);
  // send url to server and wait for resultuu
  $.ajax({
    url: toCheck,
    async: false,
    success: function(res){
      wbl = JSON.parse(res);
    }
  });
  console.log(wbl);
  if (wbl.success) {
    console.log("WHITELISTED!");
    return
  } else {
    if (wbl.reason == 1) {
      console.log("BLACKLISTED!");
      return {redirectUrl: "https://localhost:8080/phishingPage?host="+d.url}
    } else if (wbl.reason == 2) {
      console.log("STILL CHECKING");
      // Here I need to pass control to content.js which will load the page but disable all the sensitives
      chrome.webNavigation.onCompleted.addListener(function sendMessage(details){
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
          var port = chrome.tabs.connect(tabs[0].id, {name: "pf_content"});
          console.log("Sending wbl to content plugin");
          port.postMessage(wbl);
          chrome.webNavigation.onCompleted.removeListener(sendMessage);
        });
      }, {"urls":["<all_urls>"], "types": ["main_frame"]});
    }
  }
}, {"urls":["<all_urls>"], "types": ["main_frame"]}, ["blocking", "requestBody"]);


function getHash() {}
function disableSensitive() {}
function getResult() {}
