(function () {
  "use strict";
  var N = window.Tartar, S = window.Shell;
  N.Store.init();

  var me = N.Store.me || {};
  var isManager = me.role === "admin" || me.role === "principal";
  var days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  var viewMode = document.getElementById("viewMode");
  var entityFilter = document.getElementById("entityFilter");
  var weekGrid = document.getElementById("weekGrid");
  var lessonCount = document.getElementById("lessonCount");
  var addButton = document.getElementById("btnAddLesson");
  var printViewButton = document.getElementById("btnPrintView");
  var printAllClassesButton = document.getElementById("btnPrintAllClasses");

  function classOptions(selected) {
    return N.Store.state.classes.slice().sort(function (a, b) {
      return a.grade - b.grade || (a.stream || "").localeCompare(b.stream || "");
    }).map(function (c) {
      return '<option value="' + N.esc(c.id) + '"' + (c.id === selected ? " selected" : "") + ">" + N.esc(N.Store.classLabel(c)) + "</option>";
    }).join("");
  }

  function subjectOptions(grade, selected) {
    return N.subjectsFor(grade).map(function (subject) {
      return '<option value="' + N.esc(subject.id) + '"' + (subject.id === selected ? " selected" : "") + ">" + N.esc(subject.name) + "</option>";
    }).join("");
  }

  function collides(candidate, excludeId) {
    if (!candidate.day) return false;
    return N.Store.state.lessons.some(function (other) {
      if (other.id === excludeId || other.day !== candidate.day ||
          candidate.start >= other.end || other.start >= candidate.end) return false;
      return other.classId === candidate.classId ||
        other.teacherId === candidate.teacherId ||
        (candidate.room && other.room && candidate.room.toLowerCase() === other.room.toLowerCase());
    });
  }

  function render() {
    var mode = viewMode.value;
    var selected = entityFilter.value || "all";
    var visibleLessons = N.Store.state.lessons.filter(function (lesson) {
      if (mode === "class") return selected === "all" || lesson.classId === selected;
      return selected === "all" || lesson.teacherId === selected;
    });
    var unscheduled = visibleLessons.filter(function (lesson) { return !lesson.day; });
    var lessons = visibleLessons.filter(function (lesson) { return !!lesson.day; }).slice().sort(function (a, b) {
      return a.start.localeCompare(b.start) || a.end.localeCompare(b.end) ||
        days.indexOf(a.day) - days.indexOf(b.day);
    });
    lessonCount.textContent = lessons.length + " scheduled · " + unscheduled.length + " unscheduled";

    var unscheduledHtml = unscheduled.length
      ? '<section class="mb-3"><h2 class="card-title">Unscheduled lessons</h2><p class="small muted mt-1">Assign a weekday and time to add these lessons to the timetable.</p><div class="stack mt-2">' +
        unscheduled.map(function (lesson) {
          var cls = N.Store.classOf(lesson.classId);
          var teacher = N.Store.staffById(lesson.teacherId);
          var controls = isManager
            ? '<div style="display:flex;gap:5px;flex-wrap:wrap;"><button type="button" class="btn btn-outline btn-sm" data-action="edit" data-id="' + N.esc(lesson.id) + '">Schedule / edit</button><button type="button" class="btn btn-outline btn-sm" data-action="delete" data-id="' + N.esc(lesson.id) + '">Remove</button></div>'
            : "";
          return '<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line-soft);gap:10px;"><div style="min-width:0;"><div style="font-weight:600;font-size:13px;">' +
            N.esc(subjectName(cls, lesson.subject)) + '</div><div class="small muted">' +
            N.esc(cls ? N.Store.classLabel(cls) : "Class unavailable") + " · " +
            N.esc(teacher ? teacher.name : "Teacher unavailable") + "</div></div>" + controls + "</div>";
        }).join("") + "</div></section>"
      : "";

    var slots = {};
    lessons.forEach(function (lesson) { slots[lesson.start + "|" + lesson.end] = { start: lesson.start, end: lesson.end }; });
    var orderedSlots = Object.keys(slots).map(function (key) { return slots[key]; }).sort(function (a, b) {
      return a.start.localeCompare(b.start) || a.end.localeCompare(b.end);
    });
    if (!orderedSlots.length) {
      weekGrid.innerHTML = unscheduledHtml + (unscheduled.length ? "" : '<p class="empty-note">No lessons allocated for this view yet.</p>');
      return;
    }

    function cellFor(day, slot) {
      var cellLessons = lessons.filter(function (lesson) {
        return lesson.day === day && lesson.start === slot.start && lesson.end === slot.end;
      });
      return cellLessons.map(function (lesson) {
        var cls = N.Store.classOf(lesson.classId);
        var teacher = N.Store.staffById(lesson.teacherId);
        var identity = mode === "teacher"
          ? (cls ? N.Store.classLabel(cls) : "Class unavailable")
          : (teacher ? teacher.name : "Teacher unavailable");
        var controls = isManager
          ? '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;"><button type="button" class="btn btn-outline btn-sm" data-action="edit" data-id="' + N.esc(lesson.id) + '">Edit</button><button type="button" class="btn btn-outline btn-sm" data-action="delete" data-id="' + N.esc(lesson.id) + '">Remove</button></div>'
          : "";
        return '<div style="border:1px solid var(--line);border-radius:8px;padding:8px;margin:3px 0;min-width:118px;">' +
          '<div style="font-weight:650;">' + N.esc(subjectName(cls, lesson.subject)) + "</div>" +
          '<div class="small muted">' + N.esc(identity) + (lesson.room ? " · " + N.esc(lesson.room) : "") + "</div>" +
          controls + "</div>";
      }).join("");
    }

    weekGrid.innerHTML = unscheduledHtml + '<table style="width:100%;min-width:760px;border-collapse:collapse;"><thead><tr>' +
      '<th scope="col" style="text-align:left;padding:10px;border-bottom:1px solid var(--line);">Time</th>' +
      days.map(function (day) {
        return '<th scope="col" style="text-align:left;padding:10px;border-bottom:1px solid var(--line);">' + day + "</th>";
      }).join("") + "</tr></thead><tbody>" +
      orderedSlots.map(function (slot) {
        return '<tr><th scope="row" style="vertical-align:top;text-align:left;white-space:nowrap;padding:10px;border-bottom:1px solid var(--line);">' +
          N.esc(slot.start) + "–" + N.esc(slot.end) + "</th>" +
          days.map(function (day) {
            var content = cellFor(day, slot);
            return '<td style="vertical-align:top;padding:5px;border-bottom:1px solid var(--line);">' + (content || '<span class="small muted">—</span>') + "</td>";
          }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
  }

  function subjectName(cls, subjectId) {
    var subject = cls && N.subjectsFor(cls.grade).filter(function (item) { return item.id === subjectId; })[0];
    return subject ? subject.name : subjectId;
  }

  function printableTimetable(groups, mode) {
    var styles = [
      "@page{size:landscape;margin:12mm}",
      "body{font:11px Arial,sans-serif;color:#17231d;margin:0}",
      "h1{font-size:20px;margin:0 0 4px}",
      ".meta{font-size:11px;color:#46534b;margin:0 0 12px}",
      ".schedule{page-break-after:always;break-after:page}",
      ".schedule:last-child{page-break-after:auto;break-after:auto}",
      "table{border-collapse:collapse;width:100%;table-layout:fixed}",
      "th,td{border:1px solid #7a837c;padding:6px;vertical-align:top;text-align:left}",
      "thead th{background:#e9eddf}",
      ".time{width:82px;white-space:nowrap}",
      ".lesson{margin:0 0 5px;padding:4px;border:1px solid #d0d6d0;border-radius:3px;break-inside:avoid}",
      ".lesson:last-child{margin-bottom:0}",
      ".subject{font-weight:bold}",
      ".detail{margin-top:2px;color:#46534b;font-size:10px}",
      ".empty{color:#7a837c}",
      "@media print{thead{display:table-header-group}tr,.lesson{break-inside:avoid}}"
    ].join("");
    var title = mode === "class" ? "Class Timetables" : "Teacher Timetables";
    var body = groups.map(function (group) {
      var slots = {};
      group.lessons.forEach(function (lesson) {
        slots[lesson.start + "|" + lesson.end] = { start: lesson.start, end: lesson.end };
      });
      var orderedSlots = Object.keys(slots).map(function (key) { return slots[key]; }).sort(function (a, b) {
        return a.start.localeCompare(b.start) || a.end.localeCompare(b.end);
      });
      var rows = orderedSlots.map(function (slot) {
        var cells = days.map(function (day) {
          var matches = group.lessons.filter(function (lesson) {
            return lesson.day === day && lesson.start === slot.start && lesson.end === slot.end;
          });
          if (!matches.length) return '<td><span class="empty">—</span></td>';
          return "<td>" + matches.map(function (lesson) {
            var cls = N.Store.classOf(lesson.classId);
            var teacher = N.Store.staffById(lesson.teacherId);
            var detail = mode === "class"
              ? (teacher ? teacher.name : "Teacher unavailable")
              : (cls ? N.Store.classLabel(cls) : "Class unavailable");
            if (lesson.room) detail += " · " + lesson.room;
            return '<div class="lesson"><div class="subject">' + N.esc(subjectName(cls, lesson.subject)) +
              '</div><div class="detail">' + N.esc(detail) + "</div></div>";
          }).join("") + "</td>";
        }).join("");
        return '<tr><th class="time">' + N.esc(slot.start) + "–" + N.esc(slot.end) + "</th>" + cells + "</tr>";
      }).join("");
      return '<section class="schedule"><h1>' + N.esc(group.name) + '</h1><p class="meta">' +
        N.esc(N.SCHOOL.name) + " · " + N.esc(N.SCHOOL.termLabel) + " · " +
        group.lessons.length + (group.lessons.length === 1 ? " lesson" : " lessons") +
        '</p><table><thead><tr><th class="time">Time</th>' +
        days.map(function (day) { return "<th>" + day + "</th>"; }).join("") +
        "</tr></thead><tbody>" + (rows || '<tr><td colspan="6" class="empty">No lessons allocated.</td></tr>') +
        "</tbody></table></section>";
    }).join("");
    return "<!doctype html><html><head><meta charset=\"utf-8\"><title>" + N.esc(title) +
      '</title><style>' + styles + "</style></head><body>" + body + "</body></html>";
  }

  function openPrint(groups, mode) {
    var printWindow = window.open("", "_blank");
    if (!printWindow) {
      S.toast("Print window blocked", "Allow pop-ups for this school site, then try again.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(printableTimetable(groups, mode));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(function () {
      if (!printWindow.closed) printWindow.print();
    }, 250);
  }

  function printGroups(mode, selected, allClasses) {
    if (mode === "class") {
      var classes = allClasses
        ? N.Store.state.classes.slice()
        : N.Store.state.classes.filter(function (cls) { return cls.id === selected; });
      return classes.map(function (cls) {
        return {
          name: N.Store.classLabel(cls),
          lessons: N.Store.state.lessons.filter(function (lesson) { return lesson.classId === cls.id && lesson.day; })
        };
      });
    }
    var teachers = selected === "all"
      ? N.Store.state.staff.slice()
      : N.Store.state.staff.filter(function (person) { return person.id === selected; });
    return teachers.map(function (teacher) {
      return {
        name: teacher.name,
        lessons: N.Store.state.lessons.filter(function (lesson) { return lesson.teacherId === teacher.id && lesson.day; })
      };
    });
  }

  function lessonForm(existing) {
    var classes = N.Store.state.classes;
    var staff = N.Store.state.staff;
    if (!classes.length || !staff.length) {
      S.toast("Cannot allocate a lesson", !classes.length ? "Create a class first." : "Add staff members first.");
      return;
    }
    var classId = existing ? existing.classId : classes[0].id;
    var cls = N.Store.classOf(classId);
    var teacherOptions = staff.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (person) {
      return '<option value="' + N.esc(person.id) + '"' + (person.id === (existing && existing.teacherId) ? " selected" : "") + ">" + N.esc(person.name) + "</option>";
    }).join("");
    var html = "<h2>" + (existing ? "Edit lesson allocation" : "Add lesson details") + '</h2><form id="lessonForm">' +
      '<div class="field"><label for="lessonClass">Class</label><div class="select-wrap"><select required id="lessonClass" name="classId">' + classOptions(classId) + "</select></div></div>" +
      '<div class="field"><label for="lessonSubject">Learning area</label><div class="select-wrap"><select required id="lessonSubject" name="subject">' + subjectOptions(cls.grade, existing && existing.subject) + "</select></div></div>" +
      '<div class="field"><label for="lessonTeacher">Teacher</label><div class="select-wrap"><select required id="lessonTeacher" name="teacherId">' + teacherOptions + "</select></div></div>" +
      '<p class="small muted">Save lesson details now; choose a day and time later to place it on the timetable.</p>' +
      '<div class="field"><label for="lessonDay">Day</label><div class="select-wrap"><select id="lessonDay" name="day"><option value="">Not scheduled</option>' + days.map(function (day) {
        return '<option value="' + day + '"' + (day === (existing && existing.day) ? " selected" : "") + ">" + day + "</option>";
      }).join("") + "</select></div></div>" +
      '<div class="form-row-2"><div class="field"><label for="lessonStart">Start time</label><input id="lessonStart" type="time" name="start" value="' + N.esc(existing ? existing.start || "" : "") + '"></div>' +
      '<div class="field"><label for="lessonEnd">End time</label><input id="lessonEnd" type="time" name="end" value="' + N.esc(existing ? existing.end || "" : "") + '"></div></div>' +
      '<div class="field"><label for="lessonRoom">Room (optional)</label><input id="lessonRoom" type="text" name="room" maxlength="50" value="' + N.esc(existing ? existing.room || "" : "") + '" placeholder="e.g. Room 4"></div>' +
      '<p class="small" id="lessonError" role="alert" style="color:var(--danger,#a6402a);"></p>' +
      '<button type="submit" class="btn btn-primary btn-block mt-2">' + (existing ? "Save changes" : "Save lesson") + "</button></form>";
    var dialog = S.openDialog(html);
    var form = dialog.el.querySelector("#lessonForm");
    var classSelect = form.elements.classId;
    var daySelect = form.elements.day;
    var startInput = form.elements.start;
    var endInput = form.elements.end;
    function syncScheduleFields() {
      var scheduled = !!daySelect.value;
      startInput.disabled = endInput.disabled = !scheduled;
      startInput.required = endInput.required = scheduled;
      if (!scheduled) {
        startInput.value = "";
        endInput.value = "";
      } else {
        if (!startInput.value) startInput.value = "08:00";
        if (!endInput.value) endInput.value = "08:40";
      }
    }
    syncScheduleFields();
    daySelect.addEventListener("change", syncScheduleFields);
    classSelect.addEventListener("change", function () {
      var selected = N.Store.classOf(classSelect.value);
      form.elements.subject.innerHTML = selected ? subjectOptions(selected.grade, "") : "";
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var formData = new FormData(form);
      var lesson = {
        id: existing ? existing.id : "",
        classId: String(formData.get("classId")),
        subject: String(formData.get("subject")),
        teacherId: String(formData.get("teacherId")),
        day: String(formData.get("day") || ""),
        start: String(formData.get("start") || ""),
        end: String(formData.get("end") || ""),
        room: String(formData.get("room") || "").trim()
      };
      var error = form.querySelector("#lessonError");
      if (lesson.day && lesson.start >= lesson.end) {
        error.textContent = "The end time must be later than the start time.";
        return;
      }
      if (collides(lesson, existing && existing.id)) {
        error.textContent = "This time overlaps another lesson for the same class, teacher, or room.";
        return;
      }
      var submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      error.textContent = "";
      N.Store.saveLesson(lesson).then(function () {
        dialog.close();
        S.toast(existing ? "Lesson updated" : "Lesson saved", lesson.day
          ? lesson.day + " · " + lesson.start + "–" + lesson.end
          : "Saved without a day. Schedule it later from the unscheduled lessons list.");
        render();
      }).catch(function (reason) {
        submit.disabled = false;
        error.textContent = reason.message || "Could not save the lesson.";
      });
    });
  }

  function updateFilter() {
    var mode = viewMode.value;
    if (mode === "class") {
      var eligibleClasses = N.Store.state.classes.filter(function (cls) {
        return isManager || N.Store.state.lessons.some(function (lesson) {
          return lesson.classId === cls.id && lesson.teacherId === me.staffId;
        });
      });
      entityFilter.innerHTML = (isManager ? '<option value="all">All classes</option>' : "") +
        eligibleClasses.map(function (cls) {
          return '<option value="' + N.esc(cls.id) + '">' + N.esc(N.Store.classLabel(cls)) + "</option>";
        }).join("");
    } else {
      var eligibleStaff = isManager
        ? N.Store.state.staff
        : N.Store.state.staff.filter(function (person) { return person.id === me.staffId; });
      entityFilter.innerHTML = (isManager ? '<option value="all">All teachers</option>' : "") +
        eligibleStaff.map(function (person) {
          return '<option value="' + N.esc(person.id) + '">' + N.esc(person.name) + "</option>";
        }).join("");
    }
    if (!isManager && entityFilter.options.length) entityFilter.selectedIndex = 0;
    updatePrintLabel();
  }

  function updatePrintLabel() {
    var selected = entityFilter.value || "all";
    if (selected === "all") {
      printViewButton.textContent = viewMode.value === "class" ? "Print all classes" : "Print all teachers";
      return;
    }
    printViewButton.textContent = viewMode.value === "class" ? "Print selected class" : "Print selected teacher";
  }

  viewMode.innerHTML = isManager
    ? '<option value="class">By class</option><option value="teacher">By teacher</option>'
    : '<option value="teacher">My teaching schedule</option><option value="class">My lessons by class</option>';
  viewMode.addEventListener("change", function () {
    updateFilter();
    render();
  });
  entityFilter.addEventListener("change", function () { updatePrintLabel(); render(); });
  updateFilter();
  addButton.hidden = !isManager;
  printAllClassesButton.hidden = !isManager;
  printViewButton.addEventListener("click", function () {
    var mode = viewMode.value;
    var selected = entityFilter.value || "all";
    var groups = printGroups(mode, selected, false);
    if (!groups.length) {
      S.toast("Nothing to print", mode === "class" ? "Select a class first." : "Select a teacher first.");
      return;
    }
    openPrint(groups, mode);
  });
  printAllClassesButton.addEventListener("click", function () {
    var groups = printGroups("class", "all", true);
    if (!groups.length) {
      S.toast("Nothing to print", "Create at least one class first.");
      return;
    }
    openPrint(groups, "class");
  });
  if (isManager) addButton.addEventListener("click", function () { lessonForm(null); });

  weekGrid.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    var lesson = N.Store.state.lessons.filter(function (item) { return item.id === button.getAttribute("data-id"); })[0];
    if (!lesson) return;
    if (button.getAttribute("data-action") === "edit") {
      lessonForm(lesson);
      return;
    }
    if (!confirm("Remove this lesson from the timetable?")) return;
    button.disabled = true;
    N.Store.deleteLesson(lesson.id).then(function () {
      S.toast("Lesson removed", N.Store.classLabel(N.Store.classOf(lesson.classId)));
      render();
    }).catch(function (reason) {
      button.disabled = false;
      S.toast("Could not remove lesson", reason.message || "Try again.");
    });
  });

  render();
})();
