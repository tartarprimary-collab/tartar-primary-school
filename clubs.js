(function () {
  "use strict";
  var N = window.Tartar;
  N.Store.init();

  var notice = document.getElementById("clubNotice");
  var list = document.getElementById("clubRequests");

  function request(path, body) {
    return fetch(path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + N.Store._token()
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (response) {
      return response.json().then(function (data) {
        data.ok = response.ok;
        return data;
      });
    });
  }

  function render(items) {
    var pending = items.filter(function (item) { return item.status === "Pending"; }).length;
    notice.textContent = items.length
      ? pending + " pending · " + items.length + " total request" + (items.length === 1 ? "" : "s")
      : "No learners have submitted club or society choices yet.";
    list.innerHTML = items.map(function (item) {
      var status = ["Pending", "Approved", "Declined"].indexOf(item.status) >= 0 ? item.status : "Pending";
      var badge = status === "Approved" ? "badge-good" : status === "Declined" ? "badge-bad" : "badge-gold";
      var activities = Array.isArray(item.activities) ? item.activities : [];
      return '<article class="card card-pad"><div class="row-between"><div><h2>' +
        N.esc(item.student_name || "Unknown learner") + '</h2><p class="small muted">' +
        N.esc(item.class_name || "Class not set") + " · Submitted " + N.esc(item.submitted || "") +
        '</p></div><span class="badge ' + badge + '">' + N.esc(status) + '</span></div>' +
        '<p class="mt-3"><b>Requested:</b> ' + activities.map(N.esc).join(", ") + '</p>' +
        '<div class="actions mt-3" data-request-id="' + N.esc(item.id) + '">' +
        '<button type="button" class="btn btn-primary btn-sm" data-status="Approved"' +
        (status === "Approved" ? " disabled" : "") + '>Approve</button>' +
        '<button type="button" class="btn btn-outline btn-sm" data-status="Declined"' +
        (status === "Declined" ? " disabled" : "") + '>Decline</button>' +
        (status !== "Pending" ? '<button type="button" class="btn btn-outline btn-sm" data-status="Pending">Return to pending</button>' : "") +
        (item.reviewed ? '<p class="small muted">Reviewed ' + N.esc(item.reviewed) + '</p>' : "") +
        "</div></article>";
    }).join("");
  }

  function load() {
    notice.textContent = "Loading club requests…";
    list.innerHTML = "";
    request("/api/admin/clubs").then(function (result) {
      if (!result.ok) {
        notice.textContent = result.error || "Club requests could not be loaded.";
        return;
      }
      render(result.requests || []);
    }).catch(function () {
      notice.textContent = "Could not reach the server. Check the connection and try again.";
    });
  }

  document.getElementById("refreshClubs").addEventListener("click", load);
  list.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-status]");
    if (!button) return;
    var actions = button.closest("[data-request-id]");
    if (!actions) return;
    button.disabled = true;
    request("/api/admin/clubs/update", {
      id: actions.dataset.requestId,
      status: button.dataset.status
    }).then(function (result) {
      if (!result.ok) {
        N.Store._warn(result.error || "Could not update this club request.");
        load();
        return;
      }
      N.Store._warn("");
      load();
    }).catch(function () {
      N.Store._warn("Could not reach the server. The club request was not updated.");
      button.disabled = false;
    });
  });

  load();
}());
