export function formatDate(date) {
    let year = date.getFullYear(),
        month = date.getMonth() + 1, // months are zero indexed
        montFormatted = month < 10 ? "0" + month : month,
        day = date.getDate(),
        dayFormatted = day < 10 ? "0" + day : day,
        hour = date.getHours(),
        hourFormatted = hour < 10 ? "0" + hour : hour,
        minute = date.getMinutes(),
        minuteFormatted = minute < 10 ? "0" + minute : minute;

    // YYYY-MM-DD_HH-mm
    return year + '-' + montFormatted + "-" + dayFormatted + "_" + hourFormatted + "h-" + minuteFormatted + "m";
}