class MachineGun extends Gun {
  
  MachineGun(PVector pos) {
    super(pos);
    
    damage = 5;
    speed = 20;
    shootTime = 2;
    shootTimer = shootTime;
    capacity = 80;
    ammo = capacity;
    shellSize = 4;
    size = p.size;
  }
  
  void move() {
    
    super.move();
    
    if (carrying == true) {
      
      if (keyPressed && keyCode == 'e') p.vel.mult(0.93);
      else p.vel.mult(0.97);
    }

  }
  
  void display() {
    
    super.display();
        
    pushMatrix();
    
    if (carrying == true) {
      
      translate(p.pos.x, p.pos.y + 5);
          
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
    }
    
      if (carrying == false) {
        pushMatrix();
        stroke(60);
        rotate(PI/6);
        rect(-size*0.15, 0, size*0.3, size*0.6, 3);
        popMatrix();
      }
    stroke(60);
    strokeWeight(1);
      line(0, -8.75, size*1.34, -8.75);
      line(0, 8.75, size*1.34, 8.75);
    stroke(90);
    strokeWeight(2);
      noStroke();
    fill(50);
      rect(size*0.7, -size*0.5, size*0.1, size, 5);
    stroke(150);
    strokeWeight(4);
      line(0, 0, size*1.399, 0);
    stroke(120);
    strokeWeight(3.5);
      line(0, -3.5, size*1.39, -3.5);
      line(0, 3.5, size*1.39, 3.5);
    stroke(90);
    strokeWeight(2.5);
      line(0, -6.5, size*1.37, -6.5);
      line(0, 6.5, size*1.37, 6.5);
    stroke(30);
    fill(0);
      rect(-1, -8 + (float)ammo/capacity*16, 9, 14, 5);
      noStroke();
    fill(163);
      rect(-size/3, -size/3, size/3*2, size/3*2, 5);
    fill(100);
      rect(-size/4, -size/4, size, size/2, 5);
    
    popMatrix();
  }
}
