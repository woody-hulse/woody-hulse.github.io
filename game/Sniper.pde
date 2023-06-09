class Sniper extends Gun {
  
  Sniper(PVector pos) {
    super(pos);
    
    damage = 60;
    speed = 50;
    shootTime = 50;
    shootTimer = shootTime;
    offset = -10;
    capacity = 2;
    ammo = capacity;
    size = p.size*0.7;
    shellSize = 15;
  }
  
  void display() {
    
    super.display();
    
    if (carrying == true) {
      pushMatrix();
      translate(p.pos.x, p.pos.y);
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
    
      noStroke();
      fill(102, 60, 0);
      rect(0, 0, size, size*0.5, 10);
      fill(180);
      rect(size, size*0.175, size*1.3, size*0.15);
      fill(210);
      triangle(size*1.3, size*0.1, size*0.8, size*0.25, size*1.3, size*0.4);
      fill(160);
      rect(size*0.5, size*0.15, size*0.6, size*0.2);
      rect(size*1.3, size*0.1, size*0.2, size*0.3);
      popMatrix();
    }
  }
}
