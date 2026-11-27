# Grading Discount Desk submissions

Everything runs on your own computer. Nothing is uploaded and no student data is sent to any outside service. You need Node.js 18 or later; no other installation.

## 1. Download from Canvas

1. Open the Discount Desk assignment in Canvas.
2. In the right sidebar, choose **Download Submissions**. Canvas builds a `.zip` with every student's latest files.
3. (Optional, for missing-student counts.) Open **Grades**, choose **Export › Export Entire Gradebook**, and save the CSV.

You don't need to unzip anything. The grader reads the `.zip` directly, or a folder if you've already unzipped it.

## 2. Run the grader

From the project folder:

```
node grader/grade.js "C:\path\to\submissions.zip" --roster "C:\path\to\gradebook.csv"
```

`--roster` is optional. `--out folder` picks where the results go; by default they go into a `grading-output` folder next to the zip.

## 3. What you get

| File | Use it for |
| --- | --- |
| `grades.csv` | One row per student. Objective items are filled in; the four judgment items (Q4, Q7, memo, reflection) are blank columns for you. Flags explain anything to check. |
| `review.html` | A printable sheet per student: flags, the recomputed objective items, every agent decision, and the full text of Q4, Q7, the memo and the reflection with a blank for your score. |
| `class-report.html` | How many students made each common mistake, out of how many reached that question, plus missing and unreadable submissions. |
| `class-counts.csv` | The same counts as a spreadsheet. |

## How it decides

* **Objective items (69 points)** are recomputed from the course dataset in `core/case-core.js`, using the same rules as the lab. Any score, total or code written inside a student's file is ignored, so editing the file can't raise a grade.
* **Judgment items (31 points)** stay with you: Question 4 (8), Question 7 (10), memo quality (8) and the reflection (5).
* **Uploaded HTML is never opened or run.** The grader reads the file as plain text and pulls out the data block. A file with extra script code is flagged, and the script is not run. The review sheet escapes every piece of student text, and its content security policy blocks scripts.
* **Verification codes are a hint, not proof.** A code that doesn't match the answers means the file was edited after export. A matching code proves nothing, because anyone with the page can recompute one.

## Flags you'll see

* no case file data, or more than one case file
* the HTML and JSON copies disagree
* the code doesn't match the answers (edited file)
* the name in the file doesn't match the Canvas account
* the state doesn't match the last-name initial, or a practice (Texas) case was submitted
* the memo, Q7 or reflection is identical to another student's
* no `.twbx` workbook or Word answer sheet
* Canvas marked the submission late
* the memo step wasn't completed

Each flag means "look at this", not "this is misconduct".

## Entering grades

Nothing posts to Canvas automatically. After reviewing, enter the totals in SpeedGrader, or copy them into the gradebook CSV you exported and use **Grades › Import**. Check the import preview before you confirm it.

## Tests

```
node --test tests/grader.test.js
node --test tests/core.test.js
```
