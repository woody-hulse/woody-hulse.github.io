class Pistol extends Gun{
  
  Pistol (PVector pos) {
    super(pos);

    shootTime = 15;
    shootTimer = shootTime;
    damage = 15;
    speed = 15;
    offset = -6;
    capacity = 10;
    ammo = capacity;
    shellSize = 10;
    size = p.size*0.8;
  }
  
  void display() {
    
    super.display();
    
    if (carrying == true) {
      pushMatrix();
      translate(p.pos.x, p.pos.y);
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
    
      noStroke();
      fill(180, 230);
      rect(0, 0, size*1.2, size*0.4);
      rect(0, size*0.4, size*0.5, size*0.2);
      rect(0, size*0.5, size*0.8, size*0.05);
      fill(110, 230);
      rect(size*0.1, size*0.1, size*0.7, size*0.2);
      popMatrix();
    }
  }
}
