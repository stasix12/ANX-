// מחבר מהדק (clamp sleeve) לשני צינורות קרבון בקוטר 38 מ"מ
// כל צד נכנס 78 מ"מ, ננעל עם 2 ברגי M5 שסוגרים חריץ לאורך השרוול.
$fn = 128;

tube_d    = 38;     // קוטר חיצוני של הצינור
clearance = 0.3;    // מרווח הדפסה (אם הדוק מדי -> 0.4, אם רופף -> 0.2)
wall      = 5;      // עובי דופן השרוול
L         = 160;    // אורך כולל
stop_w    = 2;      // רוחב טבעת העצירה באמצע
stop_d    = 31;     // קוטר פנימי של טבעת העצירה
slit      = 2;      // רוחב החריץ
bridge    = 6;      // אזור לא חרוץ באמצע (מחזיק את שני החצאים כגוף אחד)
bolt_d    = 5.5;    // M5
head_d    = 10;
nut_d     = 9.4;    // M5 nut across corners
ear_w     = 18;
ear_x     = 36;

id = tube_d + clearance;
od = id + 2*wall;
bolt_x = od/2 + 5.5;
bolt_z = [20, 58, L-58, L-20];

difference() {
    union() {
        cylinder(d=od, h=L);
        translate([id/2-4, -ear_w/2, 0]) cube([ear_x-id/2+4, ear_w, L]);
    }
    // קדח פנימי + טבעת עצירה
    difference() {
        translate([0,0,-1]) cylinder(d=id, h=L+2);
        translate([0,0,L/2-stop_w/2]) difference() {
            cylinder(d=id+1, h=stop_w);
            translate([0,0,-1]) cylinder(d=stop_d, h=stop_w+2);
        }
    }
    // פזות כניסה
    translate([0,0,-0.01]) cylinder(d1=id+1.5, d2=id, h=1.5);
    translate([0,0,L-1.49]) cylinder(d1=id, d2=id+1.5, h=1.5);
    // חריצים
    for (z0 = [-1, L/2+bridge/2]) translate([0, -slit/2, z0]) cube([ear_x+1, slit, L/2-bridge/2+1]);
    // ברגים
    for (z = bolt_z) translate([bolt_x, 0, z]) rotate([-90,0,0]) {
        translate([0,0,-ear_w]) cylinder(d=bolt_d, h=2*ear_w);
        translate([0,0, 5]) cylinder(d=head_d, h=ear_w);          // שקע לראש
        translate([0,0,-5-ear_w]) cylinder(d=nut_d, h=ear_w, $fn=6); // מלכודת אום
    }
}
