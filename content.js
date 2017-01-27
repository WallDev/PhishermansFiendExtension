var remoteRunner = {}; // Holds checker information if server runs checks
var runningChecks = false; // ^ I mean... really.... if server runs checks

// we listening to background process to know if we should lock the site
chrome.runtime.onConnect.addListener(function(port){
  console.assert(port.name == "pf_content");
  port.onMessage.addListener(function(msg){
    console.log(msg);
    if (msg.success == false && msg.reason == 2) {
      runningChecks = true;
      // If the message is received and requires to wait for the checks
      // we disable all inputs and URLs on page
      console.log("disabling all inputs");
      disableInputs();

      console.log("Starting to check for results");
      remoteRunner.checkID = msg.checkID;
      remoteRunner.tid = setInterval(getRemoteChecks, 200);
    };
  });
});

// Check for result of remote checks
function getRemoteChecks() {
  console.log("Checking for results of " + remoteRunner.checkID);
  $.ajax({
    url: "https://localhost:8080/getCheck?cID="+remoteRunner.checkID,
    success: function(res) {
      console.log(res);
      var result = JSON.parse(res);
      if (result.success) {
        clearInterval(remoteRunner.tid);
        // re-enable all the inputs
        enableInputs();
      } else {
        console.log(result.reason);
        switch (result.reason) {
          case 3:
            // Keep checking, not result yet
            break
          case 4:
            // check is not available on server, destroy interval and bail out
            clearInterval(remoteRunner.tid);
            return
          case 5:
            // Bad site, block it!
            //alert("PHISHING SITE DETECTED! RUN FOR YOUR LIFE!");
            clearInterval(remoteRunner.tid);
            blockThis(result.host);
            return
          case 6:
            // Grey site, we are not sure, show warning
            // TODO: Modify page view and get rid of ugly alert
            // but damn tinkering with server part is funnier :D
            console.log(remoteRunner.tid);
            clearInterval(remoteRunner.tid);
            changeView();
          case 7:
            // good website, re-enable everything
            enableInputs();
            console.log(remoteRunner);
            clearInterval(remoteRunner.tid);
          default:
            // Not sure if it needed as there should not be anything
            // except the given codes... but what the hell
            clearInterval(remoteRunner.tid);
            break
        }
      }
    }
  });
}


function changeView() {
  // the css we are going to inject
  var css = 'html {-webkit-filter: invert(100%);' +
    '-moz-filter: invert(100%);' +
    '-o-filter: invert(100%);' +
    '-ms-filter: invert(100%); }',

    head = document.getElementsByTagName('head')[0],
    body = document.getElementsByTagName('body')[0],
    style = document.createElement('style');

  // create topbar with the notification and ability to revert the website back to normal
  var topbar = document.createElement("div");
  topbar.id = "phishingWarning"
  topbar.style.width = "100%";
  topbar.style.height = "100px";
  topbar.style.backgroundColor = "white";
  topbar.style.color = "black";
  topbar.style.position = "absolute";
  topbar.style.zIndex = "9999";
  //var rev = document.createElement("a");
  //rev.id = "phisingWarningLink";
  //rev.innerHTML = "click here to revert";
  //rev.href = "#";
  //rev.addEventListener("click", changeView);
  topbar.innerHTML = "Possible phishing website detected. If you are sure this website is OK click here to revert";
  // FIXME: or maybe don't.... the link is not reverting back because i'm not preventing default here
  //topbar.appendChild(rev);
  topbar.addEventListener("click", changeView);

  // a hack, so you can "invert back" clicking the link
  if (!window.counter) {
    window.counter = 1;
    body.insertBefore(topbar, body.firstChild);
  } else  {
    window.counter ++;
    if (window.counter % 2 == 0) {
      var css ='html {-webkit-filter: invert(0%); -moz-filter:    invert(0%); -o-filter: invert(0%); -ms-filter: invert(0%); }'
      body.removeChild(document.getElementById(topbar.id));
    }
  };

  style.type = 'text/css';
  if (style.styleSheet){
    style.styleSheet.cssText = css;
  } else {
    style.appendChild(document.createTextNode(css));
  }

  //injecting the css to the head
  head.appendChild(style);
}

function blockThis(url) {
  window.location = "https://localhost:8080/phishingPage?host="+url
}

function disableInputs() {
  // disable inputs
  $(":input").prop("disabled", true);
  // TODO: think of better way to disable inputs and links
  // as it might be a problem later with re-enabling
  // currently I just disable all the inputs but the links keep working
  // When I re-enable I can enable even the inputs that shuld be disabled
  // by design.
  // One possible solution would be to store a dict with all disabled
  // inputs and their initial state, and re-enable them using this dict
  // This should also work for links as best way to disable links is to
  // remove hrefs, therefore dict should keep original hrefs for each
  // anchor we disable
  //$("a").prop("disabled", true);

}

function enableInputs() {
  //     ^ this
  $(":input").prop("disabled", false);
}

function checkUrlsValidity() {
  // loop over URLs and check if their .text matching their href
  // in case <a href="fakebook.com">facebook.com</a>  we raise alert
  var allLinks = document.getElementsByTagName('a');
  for (var i = 0; i < allLinks.length; i++) {
    var link = allLinks[i];
    var text = link.text;
    try {
      var textLink = new URL(text);
    } catch(err) {
    }
    if (textLink == undefined) {
      continue
    }
    if (link.host != textLink.host) {
      return false
    }
  }
  return true
}

function checkSuspiciousIP() {
  // We don't want to be implicitly enabled on IP based websites
  // This marked as grey
  var address = document.location.href;
  console.log("Address", address);
  var pattern = "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+";

  if(address.match(pattern) != null) {
    // check that we are not on internal network IP,
    // for now we will check only for network starting on 192.168
    console.log(address);
    if (address.includes("192.168") || address.includes('127.0.0.1')) { //sloppy check
      return true
    }
    return false;
  }
  return true;
};

function checkHostsFrequency() {
  // We check how many times the same host linked
  // If there is too many links that leading outbound we mark the website grey
  var hostsFrequency = [];

  var allLinks = document.getElementsByTagName("a");
  for (var i = 0; i < allLinks.length; i++) {
    var link = allLinks[i];
    var href = link.href;
    var host = link.host;

    if(host == "") {
      continue;
    }

    if(hostsFrequency[host] == undefined) {
      hostsFrequency[host] = 0;
    }

    hostsFrequency[host]++;
  }

  var winnerHost = null;
  var winnerHostFrequency = 0;
  for (var host in hostsFrequency) {
    if(hostsFrequency[host] > winnerHostFrequency) {
      winnerHost = host;
      winnerHostFrequency = hostsFrequency[host];
    }
  }

  if(winnerHost != null) {
    var address = document.location.href.toLowerCase();
    var host = winnerHost.toLowerCase();
    if(address.indexOf(host) < 0) {
      return false;
    }
  }
  return true;
};

function run() {
  // This runs always, even if the website is whitelisted just to be sure
  // that there is no some kind of injection in the website
  console.log("Starting in place checks");
  var suspIP = checkSuspiciousIP();
  var hostFreq = checkHostsFrequency();
  var urlsVal = checkUrlsValidity();
  if (!suspIP || !hostFreq) {
    // Suspicious IP, let's mark it grey
    changeView();
  }
  if (!urlsVal) {
    // That is really bad, lets go for red, shall we?
    blockThis(window.location.href);
  }
}

run();
