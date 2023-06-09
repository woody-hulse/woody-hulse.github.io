class Stick extends Gun {
  
  //is knife thrown
  boolean thrown;
    //direction knife is thrown
  PVector direction;
    //where knife is thrown from
  PVector returnPoint;
    //is knife coming back
  boolean returning = false;
    //how fast is knife
  float speed;
    //how long before knife runs out of energy
  float dropTimer;
  
  Stick(PVector pos) {
    super(pos);
    
    thrown = false;
    offset = -6;
    speed = 10;
    dropTimer = 0;
    damage = 34;
    size = p.size*0.7;
  }
  
  void move() {
    
    if (!mobile)
      dir = new PVector(mouseX - p.pos.x, mouseY - p.pos.y);
    else if (closestEnemy != null)
      dir = new PVector(closestEnemy.pos.x = p.pos.x, closestEnemy.pos.y - p.pos.y);
    dir.normalize();
    
    if (powerupDuration[2] > 0) speed = 25;
    else speed = 10;
    
    if (carrying == true) {
      
      if (keyPressed && key == 'e' && thrown == false) {
        thrown = true;
        pos = new PVector(p.pos.x, p.pos.y);
        pos.add(dir);
        direction = new PVector(dir.x, dir.y);
        groundAnimation = 0;
        returnPoint = new PVector(p.pos.x, p.pos.y);
        returning = false;
        dropTimer = 0;
      }
      
    } else {
      
      if (p.pos.x > pos.x - 30 && p.pos.x < pos.x + 30 && p.pos.y < pos.y + 30 && p.pos.y > pos.y - 30)
        if (carried.carrying == true) weapons.remove(carried);
          carrying = true;
        carried = this;
      
    }
    
    if (thrown == true) {
      
      /*
      dropTimer ++;
      
      if (dropTimer > 150) {
        dropTimer = 0;
        thrown = false;
        carrying = false;
      }
      
      */
      
        if (sqrt(sq(pos.x - returnPoint.x) + sq(pos.y - returnPoint.y)) > 400) returning = true;
        
        if (returning == false) pos.add(direction.normalize().mult(speed*gameSpeed));
        else {
          pos.add(new PVector(p.pos.x - pos.x, p.pos.y - pos.y).normalize().mult(speed));
        }
        
        for (Enemy e : enemies) {
          if (dist(e.pos.x, e.pos.y, pos.x, pos.y) < size + e.size/2 + 5) {
            explosions.add(new Explosion(pos, 20, color(255)));
            
            e.health -= damage;
            returning = true;
          }
        }
      
      if (pos.x > width - p.size/2 || pos.x < p.size/2 || pos.y > height - p.size/2 || pos.y < p.size/2)
        returning = true;
        
      if (dist(p.pos.x, p.pos.y, pos.x, pos.y) < 15 && returning == true) thrown = false;
      }
  }

  void display() {
  
    super.display();
  
    pushMatrix();
      
    if (thrown == true) {
        
      translate(pos.x, pos.y);
        
      groundAnimation += 0.4*(gameSpeed/2 + 0.5);
      if (dir.x >= 0) rotate(atan(direction.y/direction.x) + groundAnimation);
      else rotate(atan(direction.y/direction.x) + PI + groundAnimation);
        
    } else {
        
      translate(p.pos.x + dir.x * p.size/2, p.pos.y + dir.y * p.size/2);
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
        
    }
      
    noStroke();
    if (powerupDuration[2] > 0) fill(255, 140, 0);
    else fill(0, 120, 32);
    beginShape();
      vertex(size*0.4, size*0.2);
      vertex(size*0.55, size*0.35);
      vertex(size*0.7, size*0.3);
      vertex(size*0.6, size*0.21);
    endShape();
    fill(120, 76, 0);
    beginShape();
      vertex(-size*0.4, 0);
      vertex(size*0.1, size*0.3);
      vertex(size*0.7, size*0.15);
      vertex(size*0.75, size*0.08);
      vertex(size*0.19, size*0.18);
    endShape();
    fill(94, 58, 0);
    beginShape();
      vertex(-size*0.5, -size*0.05);
      vertex(-size*0.6, size*0.17);
      vertex(-size*0.2, size*0.3);
      vertex(size*0.8, -size*0.2);
      vertex(size*0.7, -size*0.3);
      vertex(0, 0);
    endShape();
    popMatrix();
    
  }
}
